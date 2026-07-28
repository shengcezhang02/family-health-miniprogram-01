function createInMemoryFamilyStore({ beforeFamilyCommit = async () => {} } = {}) {
  const usersByOpenId = new Map();
  const familiesById = new Map();
  const membershipsById = new Map();

  return {
    async getUserByOpenId(openId) {
      return usersByOpenId.get(openId) ?? null;
    },

    async createUser(user) {
      usersByOpenId.set(user.wechatOpenId, structuredClone(user));
      return structuredClone(user);
    },

    async createFamilyWithAdmin({ family, membership }) {
      await beforeFamilyCommit();
      familiesById.set(family._id, structuredClone(family));
      membershipsById.set(membership._id, structuredClone(membership));
    },

    async listActiveFamiliesByUserId(userId) {
      return [...membershipsById.values()]
        .filter(
          (membership) =>
            membership.userId === userId && membership.status === "active",
        )
        .map((membership) => ({
          family: structuredClone(familiesById.get(membership.familyId)),
          membership: structuredClone(membership),
        }));
    },

    async setMembershipStatusForTest(membershipId, status) {
      const membership = membershipsById.get(membershipId);
      membershipsById.set(membershipId, {
        ...membership,
        status,
      });
    },
  };
}

module.exports = {
  createInMemoryFamilyStore,
};
