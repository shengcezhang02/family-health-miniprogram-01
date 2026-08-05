class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const ANALYSIS_TEMPLATES = {
  sys_blood_pressure: {
    analysisType: "blood_pressure",
    fieldKeys: ["systolic", "diastolic"],
  },
  sys_blood_glucose: {
    analysisType: "blood_glucose",
    fieldKeys: ["glucose", "measurementScene"],
  },
  sys_medication: {
    analysisType: "medication",
    fieldKeys: ["medicineName", "dosage"],
  },
};

function cloneRepeat(repeat) {
  return {
    ...repeat,
    ...(Array.isArray(repeat.weekdays)
      ? { weekdays: [...repeat.weekdays] }
      : {}),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toUserSummary(userId, usersById) {
  const user = usersById.get(userId);
  return {
    id: userId,
    displayName: user?.displayName ?? "家庭成员",
    avatarUrl: user?.avatarUrl ?? null,
  };
}

function getTemplateColor(item, templateColorsById) {
  return item.sourceTemplateType === "custom"
    ? templateColorsById.get(item.sourceTemplateId) || "purple"
    : undefined;
}

function createTemplateColorsById(templates) {
  return new Map(
    templates.map((template) => [
      template._id,
      template.colorKey === "custom" &&
      /^#[0-9A-Fa-f]{6}$/.test(template.colorHex || "")
        ? template.colorHex.toUpperCase()
        : template.colorKey || "purple",
    ]),
  );
}

function toTimelineItem(record, usersById, templateColorsById = new Map()) {
  const item = {
    id: record._id,
    subject: toUserSummary(record.subjectUserId, usersById),
    createdBy: toUserSummary(record.createdByUserId, usersById),
    sourceTemplateType: record.sourceTemplateType,
    sourceTemplateId: record.sourceTemplateId,
    ...(record.sourceTemplateType === "custom"
      ? { templateColor: getTemplateColor(record, templateColorsById) }
      : {}),
    templateNameSnapshot: record.templateNameSnapshot,
    fieldSchemaSnapshot: record.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...record.values },
    occurredAt: toIsoString(record.occurredAt),
    createdByUserId: record.createdByUserId,
    createdAt: toIsoString(record.createdAt),
    revision: record.revision,
  };

  if (record.remark) {
    item.remark = record.remark;
  }

  if (record.deletedAt) {
    item.deletedAt = toIsoString(record.deletedAt);
  }

  if (record.sourceReminderId) {
    item.sourceReminderId = record.sourceReminderId;
  }

  return item;
}

function pickValues(values, fieldKeys) {
  return fieldKeys.reduce((result, fieldKey) => {
    if (Object.prototype.hasOwnProperty.call(values || {}, fieldKey)) {
      result[fieldKey] = values[fieldKey];
    }
    return result;
  }, {});
}

function toAnalysisRecord(record, usersById) {
  const template = ANALYSIS_TEMPLATES[record.sourceTemplateId];
  const subject = usersById.get(record.subjectUserId);

  return {
    id: record._id,
    analysisType: template.analysisType,
    subject: {
      id: record.subjectUserId,
      displayName: subject?.displayName ?? "家庭成员",
    },
    sourceTemplateId: record.sourceTemplateId,
    values: pickValues(record.values, template.fieldKeys),
    occurredAt: toIsoString(record.occurredAt),
  };
}

function toAnalysisMedicationReminder(reminder, usersById) {
  const subject = usersById.get(reminder.subjectUserId);
  const item = {
    id: reminder._id,
    subject: {
      id: reminder.subjectUserId,
      displayName: subject?.displayName ?? "家庭成员",
    },
    values: pickValues(reminder.values, ["medicineName", "dosage"]),
    plannedAt: toIsoString(reminder.plannedAt),
    status: reminder.status,
  };

  if (reminder.completedAt) {
    item.completedAt = toIsoString(reminder.completedAt);
    item.linkedRecordId = reminder.linkedRecordId;
  }

  return item;
}

function toChinaDateString(value) {
  return new Date(value.getTime() + 8 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function parseChinaDateRange(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new ApiError("INVALID_ARGUMENT", "请选择有效日期");
  }

  const startAt = new Date(`${value}T00:00:00.000+08:00`);

  if (
    Number.isNaN(startAt.getTime()) ||
    toChinaDateString(startAt) !== value
  ) {
    throw new ApiError("INVALID_ARGUMENT", "请选择有效日期");
  }

  return {
    startAt,
    endAt: new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

function getReminderDisplayStatus(
  reminder,
  currentTime,
  subjectIsActive,
) {
  if (reminder.status === "completed") {
    return "已打卡";
  }

  if (!subjectIsActive) {
    return "已暂停";
  }

  if (reminder.plannedAt.getTime() > currentTime.getTime()) {
    return "待开始";
  }

  return toChinaDateString(reminder.plannedAt) ===
    toChinaDateString(currentTime)
    ? "待打卡"
    : "未打卡";
}

function toDailyReminder(
  reminder,
  usersById,
  currentTime,
  subjectIsActive,
  templateColorsById = new Map(),
) {
  const item = {
    id: reminder._id,
    subject: toUserSummary(reminder.subjectUserId, usersById),
    createdBy: toUserSummary(reminder.createdByUserId, usersById),
    sourceTemplateType: reminder.sourceTemplateType,
    sourceTemplateId: reminder.sourceTemplateId,
    ...(reminder.sourceTemplateType === "custom"
      ? { templateColor: getTemplateColor(reminder, templateColorsById) }
      : {}),
    templateNameSnapshot: reminder.templateNameSnapshot,
    fieldSchemaSnapshot: reminder.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...reminder.values },
    plannedAt: toIsoString(reminder.plannedAt),
    notificationTimes: (reminder.notificationTimes || []).map(
      toIsoString,
    ),
    createdAt: toIsoString(reminder.createdAt),
    status: reminder.status,
    displayStatus: getReminderDisplayStatus(
      reminder,
      currentTime,
      subjectIsActive,
    ),
    subjectIsActive,
    revision: reminder.revision,
  };

  if (reminder.remark) {
    item.remark = reminder.remark;
  }

  if (reminder.completedAt) {
    item.completedAt = toIsoString(reminder.completedAt);
    item.linkedRecordId = reminder.linkedRecordId;
  }

  return item;
}

function matchesRecurringRuleDate(rule, dateString) {
  if (
    rule.deletedAt ||
    dateString < rule.startDate ||
    dateString > rule.endDate
  ) {
    return false;
  }

  if (rule.repeat.type === "daily") {
    return true;
  }

  if (rule.repeat.type === "weekly") {
    const day = new Date(`${dateString}T12:00:00Z`).getUTCDay();
    const weekday = day === 0 ? 7 : day;
    return rule.repeat.weekdays.includes(weekday);
  }

  if (rule.repeat.type === "interval_days") {
    const start = new Date(`${rule.startDate}T00:00:00Z`);
    const current = new Date(`${dateString}T00:00:00Z`);
    const elapsedDays = Math.round(
      (current.getTime() - start.getTime()) /
        (24 * 60 * 60 * 1000),
    );
    return elapsedDays % rule.repeat.intervalDays === 0;
  }

  return false;
}

function getRuleDatePhase(rule, currentDate) {
  if (currentDate < rule.startDate) {
    return "未开始";
  }

  if (currentDate > rule.endDate) {
    return "已结束";
  }

  return "进行中";
}

function toDailyRecurringRule(
  rule,
  usersById,
  currentDate,
  templateColorsById = new Map(),
) {
  const item = {
    id: rule._id,
    subject: toUserSummary(rule.subjectUserId, usersById),
    createdBy: toUserSummary(rule.createdByUserId, usersById),
    sourceTemplateType: rule.sourceTemplateType,
    sourceTemplateId: rule.sourceTemplateId,
    ...(rule.sourceTemplateType === "custom"
      ? { templateColor: getTemplateColor(rule, templateColorsById) }
      : {}),
    templateNameSnapshot: rule.templateNameSnapshot,
    fieldSchemaSnapshot: rule.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...rule.values },
    startDate: rule.startDate,
    endDate: rule.endDate,
    repeat: cloneRepeat(rule.repeat),
    dailyTimes: [...rule.dailyTimes],
    status: rule.status,
    datePhase: getRuleDatePhase(rule, currentDate),
    createdAt: toIsoString(rule.createdAt),
    revision: rule.revision,
  };

  if (rule.remark) {
    item.remark = rule.remark;
  }

  return item;
}

function createQueryApi({
  getCaller,
  queryStore,
  now = () => new Date(),
  reportError = () => {},
} = {}) {
  const actions = {
    async getAnalysisData(data) {
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
          "只有当前家庭的有效成员可以查看进阶分析",
        );
      }

      const [allRecords, allReminders, activeMemberships] =
        await Promise.all([
          queryStore.listDashboardRecords(data.familyId),
          queryStore.listDashboardReminders(data.familyId),
          queryStore.listActiveMemberships(data.familyId),
        ]);
      const records = allRecords.filter(
        (record) =>
          record.sourceTemplateType === "system" &&
          ANALYSIS_TEMPLATES[record.sourceTemplateId],
      );
      const medicationReminders = allReminders.filter(
        (reminder) =>
          reminder.sourceTemplateType === "system" &&
          reminder.sourceTemplateId === "sys_medication",
      );
      const userIds = [
        ...new Set(
          activeMemberships
            .map((activeMembership) => activeMembership.userId)
            .concat(records.map((record) => record.subjectUserId))
            .concat(
              medicationReminders.map(
                (reminder) => reminder.subjectUserId,
              ),
            ),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(
        users.map((user) => [user._id, user]),
      );

      return {
        members: activeMemberships
          .map((activeMembership) =>
            usersById.get(activeMembership.userId),
          )
          .filter(Boolean)
          .map((user) => ({
            id: user._id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? null,
            isSelf: user._id === caller._id,
            isActive: true,
          })),
        records: records.map((record) =>
          toAnalysisRecord(record, usersById),
        ),
        medicationReminders: medicationReminders.map((reminder) =>
          toAnalysisMedicationReminder(reminder, usersById),
        ),
      };
    },

    async getDashboardData(data) {
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
          "只有当前家庭的有效成员可以查看健康记录看板",
        );
      }

      const [
        records,
        reminders,
        allRules,
        activeMemberships,
        customTemplateColors,
      ] =
        await Promise.all([
          queryStore.listDashboardRecords(data.familyId),
          queryStore.listDashboardReminders(data.familyId),
          queryStore.listRecurringRules(data.familyId),
          queryStore.listActiveMemberships(data.familyId),
          queryStore.listCustomTemplateColors(data.familyId),
        ]);
      const templateColorsById = createTemplateColorsById(
        customTemplateColors,
      );
      const recurringRules = allRules.filter(
        (rule) => rule.deletedAt === undefined,
      );
      const userIds = [
        ...new Set(
          activeMemberships
            .map((activeMembership) => activeMembership.userId)
            .concat(records.map((record) => record.subjectUserId))
            .concat(records.map((record) => record.createdByUserId))
            .concat(reminders.map((reminder) => reminder.subjectUserId))
            .concat(reminders.map((reminder) => reminder.createdByUserId))
            .concat(
              recurringRules.map((rule) => rule.subjectUserId),
            )
            .concat(
              recurringRules.map((rule) => rule.createdByUserId),
            ),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(
        users.map((user) => [user._id, user]),
      );
      const currentTime = now();
      const currentDate = toChinaDateString(currentTime);
      const activeUserIds = new Set(
        activeMemberships.map(
          (activeMembership) => activeMembership.userId,
        ),
      );

      return {
        members: activeMemberships
          .map((activeMembership) =>
            usersById.get(activeMembership.userId),
          )
          .filter(Boolean)
          .map((user) => ({
            id: user._id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? null,
            isSelf: user._id === caller._id,
          })),
        records: records.map((record) =>
          toTimelineItem(record, usersById, templateColorsById),
        ),
        reminders: reminders.map((reminder) =>
          toDailyReminder(
            reminder,
            usersById,
            currentTime,
            activeUserIds.has(reminder.subjectUserId),
            templateColorsById,
          ),
        ),
        recurringRules: recurringRules.map((rule) =>
          toDailyRecurringRule(
            rule,
            usersById,
            currentDate,
            templateColorsById,
          ),
        ),
      };
    },

    async getDailyHealth(data) {
      if (typeof data.familyId !== "string" || !data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择家庭");
      }

      const dateRange = parseChinaDateRange(data.date);
      const caller = await getCaller();
      const membership = await queryStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "QUERY_ACCESS_DENIED",
          "只有当前家庭的有效成员可以查看每日健康",
        );
      }

      const [
        records,
        reminders,
        allRules,
        activeMemberships,
        customTemplateColors,
      ] =
        await Promise.all([
        queryStore.listDailyRecords(
          data.familyId,
          dateRange.startAt,
          dateRange.endAt,
        ),
        queryStore.listDailyReminders(
          data.familyId,
          dateRange.startAt,
          dateRange.endAt,
        ),
          queryStore.listRecurringRules(data.familyId),
          queryStore.listActiveMemberships(data.familyId),
          queryStore.listCustomTemplateColors(data.familyId),
        ]);
      const templateColorsById = createTemplateColorsById(
        customTemplateColors,
      );
      const recurringRules = allRules.filter((rule) =>
        matchesRecurringRuleDate(rule, data.date),
      );
      const dailyRecordIds = new Set(
        records.map((record) => record._id),
      );
      const linkedRecords = (
        await queryStore.getRecordsByIds(
          data.familyId,
          reminders
            .map((reminder) => reminder.linkedRecordId)
            .filter(Boolean),
        )
      ).filter((record) => !dailyRecordIds.has(record._id));
      const userIds = [
        ...new Set(
          activeMemberships
            .map((activeMembership) => activeMembership.userId)
            .concat(records.map((record) => record.subjectUserId))
            .concat(records.map((record) => record.createdByUserId))
            .concat(linkedRecords.map((record) => record.subjectUserId))
            .concat(linkedRecords.map((record) => record.createdByUserId))
            .concat(
              reminders.map((reminder) => reminder.subjectUserId),
              recurringRules.map((rule) => rule.subjectUserId),
            )
            .concat(
              reminders.map((reminder) => reminder.createdByUserId),
              recurringRules.map((rule) => rule.createdByUserId),
            ),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(users.map((user) => [user._id, user]));
      const currentTime = now();
      const currentDate = toChinaDateString(currentTime);
      const activeUserIds = new Set(
        activeMemberships.map(
          (activeMembership) => activeMembership.userId,
        ),
      );

      return {
        date: data.date,
        members: activeMemberships
          .map((activeMembership) =>
            usersById.get(activeMembership.userId),
          )
          .filter(Boolean)
          .map((user) => ({
            id: user._id,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl ?? null,
            isSelf: user._id === caller._id,
          })),
        records: records.map((record) =>
          toTimelineItem(record, usersById, templateColorsById),
        ),
        linkedRecords: linkedRecords.map((record) =>
          toTimelineItem(record, usersById, templateColorsById),
        ),
        reminders: reminders.map((reminder) =>
          toDailyReminder(
            reminder,
            usersById,
            currentTime,
            activeUserIds.has(reminder.subjectUserId),
            templateColorsById,
          ),
        ),
        recurringRules: recurringRules.map((rule) =>
          toDailyRecurringRule(
            rule,
            usersById,
            currentDate,
            templateColorsById,
          ),
        ),
      };
    },

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
      const [records, customTemplateColors] = await Promise.all([
        queryStore.listRecordTimeline(data.familyId, limit),
        queryStore.listCustomTemplateColors(data.familyId),
      ]);
      const templateColorsById = createTemplateColorsById(
        customTemplateColors,
      );
      const userIds = [
        ...new Set(
          records.flatMap((record) => [
            record.subjectUserId,
            record.createdByUserId,
          ]),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(users.map((user) => [user._id, user]));

      return {
        items: records.map((record) =>
          toTimelineItem(record, usersById, templateColorsById),
        ),
      };
    },

    async getDeletedRecordTimeline(data) {
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
          "只有当前家庭的有效成员可以查看已删除记录",
        );
      }

      const limit =
        Number.isInteger(data.limit) && data.limit > 0
          ? Math.min(data.limit, 50)
          : 20;
      const [records, customTemplateColors] = await Promise.all([
        queryStore.listDeletedRecords(data.familyId, limit),
        queryStore.listCustomTemplateColors(data.familyId),
      ]);
      const templateColorsById = createTemplateColorsById(
        customTemplateColors,
      );
      const userIds = [
        ...new Set(
          records.flatMap((record) => [
            record.subjectUserId,
            record.createdByUserId,
          ]),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(users.map((user) => [user._id, user]));

      return {
        items: records.map((record) =>
          toTimelineItem(record, usersById, templateColorsById),
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
