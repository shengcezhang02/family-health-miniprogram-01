function createInMemoryProfileStore({
  users = [],
  memberships = [],
  profiles = [],
} = {}) {
  const usersByOpenId = new Map(
    users.map((user) => [user.wechatOpenId, structuredClone(user)]),
  );
  const usersById = new Map(
    users.map((user) => [user._id, structuredClone(user)]),
  );
  const membershipsById = new Map(
    memberships.map((membership) => [
      membership._id,
      structuredClone(membership),
    ]),
  );
  const profilesByUserId = new Map(
    profiles.map((profile) => [profile.userId, structuredClone(profile)]),
  );

  return {
    async getUserByOpenId(openId) {
      return structuredClone(usersByOpenId.get(openId) ?? null);
    },

    async getProfileByUserId(userId) {
      return structuredClone(profilesByUserId.get(userId) ?? null);
    },

    async getUserById(userId) {
      return structuredClone(usersById.get(userId) ?? null);
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

    async listActiveFamilyMembers(familyId) {
      return [...membershipsById.values()]
        .filter(
          (membership) =>
            membership.familyId === familyId &&
            membership.status === "active",
        )
        .map((membership) => ({
          membership: structuredClone(membership),
          user: structuredClone(usersById.get(membership.userId)),
        }))
        .filter(({ user }) => Boolean(user));
    },

    async saveOwnProfile({
      userId,
      profileId,
      expectedRevision,
      values,
      timestamp,
    }) {
      const existing = profilesByUserId.get(userId) ?? null;

      if ((existing?.revision ?? 0) !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      const profile = {
        _id: existing?._id ?? profileId,
        userId,
        ...values,
        revision: expectedRevision + 1,
        updatedByUserId: userId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      profilesByUserId.set(userId, structuredClone(profile));

      return {
        outcome: "saved",
        profile: structuredClone(profile),
      };
    },

    async saveManagedProfile({
      familyId,
      callerUserId,
      ownerUserId,
      profileId,
      expectedRevision,
      values,
      timestamp,
    }) {
      const callerMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === callerUserId &&
          membership.status === "active",
      );
      const ownerMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === ownerUserId &&
          membership.status === "active",
      );

      if (
        !callerMembership ||
        !ownerMembership ||
        ownerMembership.profileManagementAllowed !== true
      ) {
        return {
          outcome: "permission-denied",
        };
      }

      const existing = profilesByUserId.get(ownerUserId) ?? null;

      if ((existing?.revision ?? 0) !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      const profile = {
        _id: existing?._id ?? profileId,
        userId: ownerUserId,
        ...values,
        revision: expectedRevision + 1,
        updatedByUserId: callerUserId,
        updatedViaFamilyId: familyId,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      profilesByUserId.set(ownerUserId, structuredClone(profile));

      return {
        outcome: "saved",
        profile: structuredClone(profile),
      };
    },

    async setProfileManagementAllowed({
      familyId,
      userId,
      allowed,
      timestamp,
    }) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (!membership) {
        return {
          outcome: "membership-not-found",
        };
      }

      const updated = {
        ...membership,
        profileManagementAllowed: allowed,
        revision: membership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(updated._id, structuredClone(updated));

      return {
        outcome: "updated",
        membership: structuredClone(updated),
      };
    },
  };
}

module.exports = {
  createInMemoryProfileStore,
};
