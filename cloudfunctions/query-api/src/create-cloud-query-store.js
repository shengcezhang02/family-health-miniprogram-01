function createCloudQueryStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const records = db.collection("health_records");
  const reminders = db.collection("one_time_reminders");
  const recurringRules = db.collection("recurring_rules");
  const templates = db.collection("health_templates");

  async function findOne(collection, query) {
    const result = await collection.where(query).limit(1).get();
    return result.data[0] ?? null;
  }

  return {
    async getUserByOpenId(openId) {
      return findOne(users, {
        wechatOpenId: openId,
      });
    },

    async getActiveMembership(familyId, userId) {
      return findOne(memberships, {
        familyId,
        userId,
        status: "active",
      });
    },

    async listRecordTimeline(familyId, limit) {
      const result = await records
        .where({
          familyId,
        })
        .orderBy("occurredAt", "desc")
        .limit(Math.min(limit * 3, 100))
        .get();

      return result.data
        .filter((record) => record.deletedAt === undefined)
        .slice(0, limit);
    },

    async listDashboardRecords(familyId) {
      const result = await records
        .where({
          familyId,
        })
        .orderBy("occurredAt", "desc")
        .limit(100)
        .get();

      return result.data.filter(
        (record) => record.deletedAt === undefined,
      );
    },

    async listDashboardReminders(familyId) {
      const result = await reminders
        .where({
          familyId,
        })
        .limit(100)
        .get();

      return result.data
        .filter(
          (reminder) => reminder.deletedAt === undefined,
        )
        .sort(
          (left, right) =>
            new Date(right.plannedAt).getTime() -
            new Date(left.plannedAt).getTime(),
        );
    },

    async listDeletedRecords(familyId, limit) {
      const result = await records
        .where({
          familyId,
        })
        .limit(100)
        .get();

      return result.data
        .filter((record) => record.deletedAt !== undefined)
        .sort(
          (left, right) =>
            new Date(right.deletedAt).getTime() -
            new Date(left.deletedAt).getTime(),
        )
        .slice(0, limit);
    },

    async listDailyRecords(familyId, startAt, endAt) {
      const result = await records
        .where({
          familyId,
        })
        .limit(100)
        .get();

      return result.data
        .filter((record) => {
          const occurredAt = new Date(record.occurredAt);
          return (
            record.deletedAt === undefined &&
            occurredAt >= startAt &&
            occurredAt < endAt
          );
        })
        .sort(
          (left, right) =>
            new Date(left.occurredAt).getTime() -
            new Date(right.occurredAt).getTime(),
        );
    },

    async listDailyReminders(familyId, startAt, endAt) {
      const result = await reminders
        .where({
          familyId,
        })
        .limit(100)
        .get();

      return result.data
        .filter((reminder) => {
          const plannedAt = new Date(reminder.plannedAt);
          return (
            reminder.deletedAt === undefined &&
            plannedAt >= startAt &&
            plannedAt < endAt
          );
        })
        .sort(
          (left, right) =>
            new Date(left.plannedAt).getTime() -
            new Date(right.plannedAt).getTime(),
        );
    },

    async getRecordsByIds(familyId, recordIds) {
      const results = await Promise.all(
        [...new Set(recordIds)].map((recordId) =>
          records.doc(recordId).get(),
        ),
      );
      return results
        .map((result) => result.data)
        .filter(
          (record) =>
            record &&
            record.familyId === familyId &&
            record.deletedAt === undefined,
        );
    },

    async listActiveMemberships(familyId) {
      const result = await memberships
        .where({
          familyId,
          status: "active",
        })
        .limit(100)
        .get();
      return result.data;
    },

    async listRecurringRules(familyId) {
      const result = await recurringRules
        .where({
          familyId,
        })
        .limit(100)
        .get();
      return result.data;
    },

    async listCustomTemplateColors(familyId) {
      const result = await templates
        .where({ familyId })
        .limit(100)
        .get();
      return result.data.map((template) => ({
        _id: template._id,
        colorKey: template.colorKey || "purple",
        ...(template.colorKey === "custom" && template.colorHex
          ? { colorHex: template.colorHex }
          : {}),
      }));
    },

    async getUsersByIds(userIds) {
      const results = await Promise.all(
        userIds.map((userId) => users.doc(userId).get()),
      );
      return results.map((result) => result.data).filter(Boolean);
    },
  };
}

module.exports = {
  createCloudQueryStore,
};
