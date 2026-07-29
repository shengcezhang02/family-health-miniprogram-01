function createInMemoryHealthItemStore({
  users = [],
  memberships = [],
  records = [],
} = {}) {
  const usersByOpenId = new Map(
    users.map((user) => [user.wechatOpenId, structuredClone(user)]),
  );
  const membershipsById = new Map(
    memberships.map((membership) => [
      membership._id,
      structuredClone(membership),
    ]),
  );
  const recordsById = new Map(
    records.map((record) => [record._id, structuredClone(record)]),
  );

  return {
    async getUserByOpenId(openId) {
      return structuredClone(usersByOpenId.get(openId) ?? null);
    },

    async getActiveMembership(familyId, userId) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );
      return structuredClone(membership ?? null);
    },

    async createRecord(record) {
      const existing = recordsById.get(record._id);

      if (existing) {
        return {
          outcome: "replayed",
          record: structuredClone(existing),
        };
      }

      recordsById.set(record._id, structuredClone(record));
      return {
        outcome: "created",
        record: structuredClone(record),
      };
    },

    async getRecordById(recordId) {
      return structuredClone(recordsById.get(recordId) ?? null);
    },

    inspectRecords() {
      return [...recordsById.values()].map((record) =>
        structuredClone(record),
      );
    },
  };
}

module.exports = {
  createInMemoryHealthItemStore,
};
