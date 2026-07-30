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
    revision: record.revision,
  };

  if (record.remark) {
    item.remark = record.remark;
  }

  if (record.deletedAt) {
    item.deletedAt = toIsoString(record.deletedAt);
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

function getReminderDisplayStatus(reminder, currentTime) {
  if (reminder.status === "completed") {
    return "已打卡";
  }

  if (reminder.plannedAt.getTime() > currentTime.getTime()) {
    return "待开始";
  }

  return toChinaDateString(reminder.plannedAt) ===
    toChinaDateString(currentTime)
    ? "待打卡"
    : "未打卡";
}

function toDailyReminder(reminder, usersById, currentTime) {
  const subject = usersById.get(reminder.subjectUserId);
  const item = {
    id: reminder._id,
    subject: {
      id: reminder.subjectUserId,
      displayName: subject?.displayName ?? "家庭成员",
      avatarUrl: subject?.avatarUrl ?? null,
    },
    sourceTemplateType: reminder.sourceTemplateType,
    sourceTemplateId: reminder.sourceTemplateId,
    templateNameSnapshot: reminder.templateNameSnapshot,
    fieldSchemaSnapshot: reminder.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...reminder.values },
    plannedAt: toIsoString(reminder.plannedAt),
    status: reminder.status,
    displayStatus: getReminderDisplayStatus(reminder, currentTime),
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

function createQueryApi({
  getCaller,
  queryStore,
  now = () => new Date(),
  reportError = () => {},
} = {}) {
  const actions = {
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

      const [records, reminders] = await Promise.all([
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
      ]);
      const userIds = [
        ...new Set(
          records
            .map((record) => record.subjectUserId)
            .concat(
              reminders.map((reminder) => reminder.subjectUserId),
            ),
        ),
      ];
      const users = await queryStore.getUsersByIds(userIds);
      const usersById = new Map(users.map((user) => [user._id, user]));
      const currentTime = now();

      return {
        date: data.date,
        records: records.map((record) =>
          toTimelineItem(record, usersById),
        ),
        reminders: reminders.map((reminder) =>
          toDailyReminder(reminder, usersById, currentTime),
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
      const records = await queryStore.listDeletedRecords(
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
