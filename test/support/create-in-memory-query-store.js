function createInMemoryQueryStore({
  users = [],
  memberships = [],
  records = [],
  reminders = [],
  recurringRules = [],
  templates = [],
} = {}) {
  const usersById = new Map(
    users.map((user) => [user._id, structuredClone(user)]),
  );

  return {
    async getActiveMembership(familyId, userId) {
      const membership = memberships.find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );
      return structuredClone(membership ?? null);
    },

    async listRecordTimeline(familyId, limit) {
      return records
        .filter(
          (record) =>
            record.familyId === familyId && record.deletedAt === undefined,
        )
        .sort(
          (left, right) =>
            right.occurredAt.getTime() - left.occurredAt.getTime(),
        )
        .slice(0, limit)
        .map((record) => structuredClone(record));
    },

    async listDashboardRecords(familyId) {
      return records
        .filter(
          (record) =>
            record.familyId === familyId &&
            record.deletedAt === undefined,
        )
        .sort(
          (left, right) =>
            right.occurredAt.getTime() - left.occurredAt.getTime(),
        )
        .map((record) => structuredClone(record));
    },

    async listDashboardReminders(familyId) {
      return reminders
        .filter(
          (reminder) =>
            reminder.familyId === familyId &&
            reminder.deletedAt === undefined,
        )
        .sort(
          (left, right) =>
            right.plannedAt.getTime() - left.plannedAt.getTime(),
        )
        .map((reminder) => structuredClone(reminder));
    },

    async listDeletedRecords(familyId, limit) {
      return records
        .filter(
          (record) =>
            record.familyId === familyId && record.deletedAt !== undefined,
        )
        .sort(
          (left, right) =>
            right.deletedAt.getTime() - left.deletedAt.getTime(),
        )
        .slice(0, limit)
        .map((record) => structuredClone(record));
    },

    async listDailyRecords(familyId, startAt, endAt) {
      return records
        .filter(
          (record) =>
            record.familyId === familyId &&
            record.deletedAt === undefined &&
            record.occurredAt >= startAt &&
            record.occurredAt < endAt,
        )
        .sort(
          (left, right) =>
            left.occurredAt.getTime() - right.occurredAt.getTime(),
        )
        .map((record) => structuredClone(record));
    },

    async listDailyReminders(familyId, startAt, endAt) {
      return reminders
        .filter(
          (reminder) =>
            reminder.familyId === familyId &&
            reminder.deletedAt === undefined &&
            reminder.plannedAt >= startAt &&
            reminder.plannedAt < endAt,
        )
        .sort(
          (left, right) =>
            left.plannedAt.getTime() - right.plannedAt.getTime(),
        )
        .map((reminder) => structuredClone(reminder));
    },

    async getRecordsByIds(familyId, recordIds) {
      const recordIdSet = new Set(recordIds);
      return records
        .filter(
          (record) =>
            record.familyId === familyId &&
            record.deletedAt === undefined &&
            recordIdSet.has(record._id),
        )
        .map((record) => structuredClone(record));
    },

    async listActiveMemberships(familyId) {
      return memberships
        .filter(
          (membership) =>
            membership.familyId === familyId &&
            membership.status === "active",
        )
        .map((membership) => structuredClone(membership));
    },

    async listRecurringRules(familyId) {
      return recurringRules
        .filter((rule) => rule.familyId === familyId)
        .map((rule) => structuredClone(rule));
    },

    async listCustomTemplateColors(familyId) {
      return templates
        .filter((template) => template.familyId === familyId)
        .map((template) => ({
          _id: template._id,
          colorKey: template.colorKey || "purple",
          ...(template.colorKey === "custom" && template.colorHex
            ? { colorHex: template.colorHex }
            : {}),
        }));
    },

    async getUsersByIds(userIds) {
      return userIds
        .map((userId) => usersById.get(userId))
        .filter(Boolean)
        .map((user) => structuredClone(user));
    },
  };
}

module.exports = {
  createInMemoryQueryStore,
};
