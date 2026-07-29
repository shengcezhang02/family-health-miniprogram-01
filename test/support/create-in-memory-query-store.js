function createInMemoryQueryStore({
  users = [],
  memberships = [],
  records = [],
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
