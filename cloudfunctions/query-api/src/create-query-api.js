class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toTimelineItem(record, usersById) {
  const subject = usersById.get(record.subjectUserId);
  const item = {
    id: record._id,
    subject: {
      id: record.subjectUserId,
      displayName: subject?.displayName ?? "家庭成员",
      avatarUrl: subject?.avatarUrl ?? null,
    },
    sourceTemplateType: record.sourceTemplateType,
    sourceTemplateId: record.sourceTemplateId,
    templateNameSnapshot: record.templateNameSnapshot,
    fieldSchemaSnapshot: record.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...record.values },
    occurredAt: toIsoString(record.occurredAt),
    createdByUserId: record.createdByUserId,
  };

  if (record.remark) {
    item.remark = record.remark;
  }

  return item;
}

function createQueryApi({
  getCaller,
  queryStore,
  reportError = () => {},
} = {}) {
  const actions = {
    async getRecordTimeline(data) {
      if (typeof data.familyId !== "string" || !data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择家庭");
      }

      const caller = await getCaller();
      const membership = await queryStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "QUERY_ACCESS_DENIED",
          "只有当前家庭的有效成员可以查看时间线",
        );
      }

      const limit =
        Number.isInteger(data.limit) && data.limit > 0
          ? Math.min(data.limit, 50)
          : 20;
      const records = await queryStore.listRecordTimeline(
        data.familyId,
        limit,
      );
      const userIds = [
        ...new Set(records.map((record) => record.subjectUserId)),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(users.map((user) => [user._id, user]));

      return {
        items: records.map((record) =>
          toTimelineItem(record, usersById),
        ),
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
          data: await action(request.data ?? {}),
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
  createQueryApi,
};
