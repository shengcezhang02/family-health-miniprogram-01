class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SHARE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const CARD_STYLE_CODES = new Set([
  "warm-green",
  "sunset",
  "clear-blue",
]);

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function createCareShareApi({
  getCaller,
  careShareStore,
  createCredentials,
  createShareId,
  createReminderId,
  hashToken,
  getSystemTemplate,
  now,
  reportError = () => {},
} = {}) {
  function toCreateResult(result, credentials) {
    return {
      share: {
        id: result.share._id,
        token: credentials.token,
        path: `/pages/care-share/care-share?token=${encodeURIComponent(
          credentials.token,
        )}`,
        cardStyleCode: result.share.cardStyleCode,
        displaySnapshot: {
          ...result.share.displaySnapshot,
        },
        sentAt: toIsoString(result.share.sentAt),
        expiresAt: toIsoString(result.share.expiresAt),
      },
      replayed: result.outcome === "replayed",
    };
  }

  const actions = {
    async createCareShare(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim()
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "缺少本次分享的请求编号，请重试",
        );
      }

      if (
        data.source?.type !== "reminder" &&
        data.source?.type !== "immediate"
      ) {
        throw new ApiError("INVALID_ARGUMENT", "请选择分享内容");
      }

      if (!CARD_STYLE_CODES.has(data.cardStyleCode)) {
        throw new ApiError("INVALID_ARGUMENT", "请选择分享卡片样式");
      }

      const caller = await getCaller();

      if (!caller) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "用户信息尚未初始化，请重新进入小程序",
        );
      }

      const credentials = createCredentials({
        callerUserId: caller._id,
        requestId: request.requestId,
      });
      const timestamp = now();
      const shareId = createShareId({
        callerUserId: caller._id,
        requestId: request.requestId,
      });

      if (data.source.type === "immediate") {
        const source = data.source;

        if (!source.familyId || !source.subjectUserId) {
          throw new ApiError(
            "INVALID_ARGUMENT",
            "请选择家庭和档案所属人",
          );
        }

        const sourceTemplateType =
          source.sourceTemplateType === "custom" ? "custom" : "system";
        const [callerMembership, subjectMembership, family, subject, template] =
          await Promise.all([
            careShareStore.getActiveMembership(
              source.familyId,
              caller._id,
            ),
            careShareStore.getActiveMembership(
              source.familyId,
              source.subjectUserId,
            ),
            careShareStore.getFamilyById(source.familyId),
            careShareStore.getUserById(source.subjectUserId),
            sourceTemplateType === "system"
              ? Promise.resolve(getSystemTemplate(source.sourceTemplateId))
              : careShareStore.getCustomTemplate(
                  source.familyId,
                  source.sourceTemplateId,
                ),
          ]);

        if (!callerMembership || !subjectMembership) {
          throw new ApiError(
            "CARE_SHARE_ACCESS_DENIED",
            "只能为当前家庭的有效成员发起关心分享",
          );
        }

        if (!family || !subject) {
          throw new ApiError(
            "INVALID_ARGUMENT",
            "家庭或档案所属人不存在",
          );
        }

        if (!template || template.status === "inactive") {
          throw new ApiError(
            "TEMPLATE_NOT_FOUND",
            "这个健康项目不存在或已停用",
          );
        }

        const activeFields = template.fields
          .filter((field) => field.status !== "inactive")
          .map(({ status, ...field }) => ({
            ...field,
            ...(Array.isArray(field.options)
              ? {
                  options: field.options
                    .filter((option) => option.status !== "inactive")
                    .map(({ status: optionStatus, ...option }) => ({
                      ...option,
                    })),
                }
              : {}),
          }));
        const reminderId = createReminderId({
          callerUserId: caller._id,
          requestId: request.requestId,
        });
        const remark =
          typeof source.remark === "string" ? source.remark.trim() : "";

        if (remark.length > 200) {
          throw new ApiError("INVALID_ARGUMENT", "提醒内容最多 200 个字");
        }

        const reminder = {
          _id: reminderId,
          familyId: source.familyId,
          subjectUserId: source.subjectUserId,
          sourceTemplateType,
          sourceTemplateId: source.sourceTemplateId,
          templateNameSnapshot: template.name,
          fieldSchemaSnapshot: activeFields,
          values: {},
          ...(remark ? { remark } : {}),
          plannedAt: timestamp,
          notificationTimes: [],
          notificationAttemptCount: 0,
          status: "pending",
          creationSource: "care_share",
          dedupKey: `item:${reminderId}`,
          createdByUserId: caller._id,
          updatedByUserId: caller._id,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const displaySnapshot = {
          familyName: family.name,
          subjectDisplayName: subject.displayName,
          templateName: template.name,
        };
        const result = await careShareStore.createImmediateCareShare({
          reminder,
          share: {
            _id: shareId,
            familyId: reminder.familyId,
            reminderId: reminder._id,
            subjectUserId: reminder.subjectUserId,
            senderUserId: caller._id,
            tokenHash: credentials.tokenHash,
            cardStyleCode: data.cardStyleCode,
            displaySnapshot,
            sentAt: timestamp,
            expiresAt: new Date(timestamp.getTime() + SHARE_LIFETIME_MS),
            createdAt: timestamp,
          },
        });

        if (result.outcome === "permission-denied") {
          throw new ApiError(
            "CARE_SHARE_ACCESS_DENIED",
            "只能为当前家庭的有效成员发起关心分享",
          );
        }

        return toCreateResult(result, credentials);
      }

      if (
        typeof data.source.reminderId !== "string" ||
        !data.source.reminderId
      ) {
        throw new ApiError("INVALID_ARGUMENT", "请选择要分享的提醒");
      }

      const reminder = await careShareStore.getReminderById(
        data.source.reminderId,
      );

      if (!reminder || reminder.deletedAt) {
        throw new ApiError(
          "REMINDER_UNAVAILABLE",
          "这个提醒不存在或已取消",
        );
      }

      if (reminder.status !== "pending") {
        throw new ApiError(
          "REMINDER_COMPLETED",
          "这个提醒已经完成",
        );
      }

      const [callerMembership, subjectMembership, family, subject] =
        await Promise.all([
          careShareStore.getActiveMembership(
            reminder.familyId,
            caller._id,
          ),
          careShareStore.getActiveMembership(
            reminder.familyId,
            reminder.subjectUserId,
          ),
          careShareStore.getFamilyById(reminder.familyId),
          careShareStore.getUserById(reminder.subjectUserId),
        ]);

      if (!callerMembership || !subjectMembership) {
        throw new ApiError(
          "CARE_SHARE_ACCESS_DENIED",
          "只能分享当前家庭有效成员的提醒",
        );
      }

      if (!family || !subject) {
        throw new ApiError(
          "REMINDER_UNAVAILABLE",
          "提醒所属的家庭或成员不存在",
        );
      }

      const displaySnapshot = {
        familyName: family.name,
        subjectDisplayName: subject.displayName,
        templateName: reminder.templateNameSnapshot,
      };
      const result = await careShareStore.createCareShare({
        _id: shareId,
        familyId: reminder.familyId,
        reminderId: reminder._id,
        subjectUserId: reminder.subjectUserId,
        senderUserId: caller._id,
        tokenHash: credentials.tokenHash,
        cardStyleCode: data.cardStyleCode,
        displaySnapshot,
        sentAt: timestamp,
        expiresAt: new Date(timestamp.getTime() + SHARE_LIFETIME_MS),
        createdAt: timestamp,
      });

      return toCreateResult(result, credentials);
    },

    async resolveCareShare(data) {
      if (typeof data.token !== "string" || !data.token) {
        throw new ApiError("CARE_SHARE_INVALID", "这份关心分享无效");
      }

      const [caller, share] = await Promise.all([
        getCaller(),
        careShareStore.getCareShareByTokenHash(hashToken(data.token)),
      ]);

      if (!caller) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "用户信息尚未初始化，请重新进入小程序",
        );
      }

      if (!share) {
        throw new ApiError("CARE_SHARE_INVALID", "这份关心分享无效");
      }

      if (share.expiresAt.getTime() <= now().getTime()) {
        return {
          share: {
            status: "expired",
          },
        };
      }

      const [reminder, callerMembership, subjectMembership] =
        await Promise.all([
          careShareStore.getReminderById(share.reminderId),
          careShareStore.getActiveMembership(share.familyId, caller._id),
          careShareStore.getActiveMembership(
            share.familyId,
            share.subjectUserId,
          ),
        ]);

      if (!reminder || reminder.deletedAt) {
        return {
          share: {
            status: "canceled",
          },
        };
      }

      if (reminder.status === "completed") {
        return {
          share: {
            status: "completed",
          },
        };
      }

      if (!subjectMembership) {
        return {
          share: {
            status: "paused",
          },
        };
      }

      if (!callerMembership) {
        return {
          share: {
            status: "member_required",
            message: "这是一份仅限家庭成员填写的关心请求",
          },
        };
      }

      return {
        share: {
          status: "ready",
          cardStyleCode: share.cardStyleCode,
          displaySnapshot: {
            ...share.displaySnapshot,
          },
          sentAt: toIsoString(share.sentAt),
          expiresAt: toIsoString(share.expiresAt),
          form: {
            fields: reminder.fieldSchemaSnapshot.map((field) => ({
              ...field,
            })),
            values: {
              ...reminder.values,
            },
            ...(reminder.remark ? { remark: reminder.remark } : {}),
            plannedAt: toIsoString(reminder.plannedAt),
          },
        },
      };
    },
  };

  return {
    async handle(request = {}) {
      const action = actions[request.action];

      if (!action) {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "UNSUPPORTED_ACTION",
            message: "暂不支持这个操作",
          },
        };
      }

      try {
        return {
          ok: true,
          requestId: request.requestId,
          data: await action(request.data ?? {}, request),
        };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: error.code,
              message: error.message,
            },
          };
        }

        reportError(error);
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "INTERNAL_ERROR",
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }
    },
  };
}

module.exports = {
  createCareShareApi,
};
