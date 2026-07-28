function createInMemoryFamilyStore({ beforeFamilyCommit = async () => {} } = {}) {
  const usersByOpenId = new Map();
  const familiesById = new Map();
  const membershipsById = new Map();
  const invitesById = new Map();

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

    async getActiveMembership(familyId, userId) {
      return (
        [...membershipsById.values()].find(
          (membership) =>
            membership.familyId === familyId &&
            membership.userId === userId &&
            membership.status === "active",
        ) ?? null
      );
    },

    async createInvite(invite) {
      invitesById.set(invite._id, structuredClone(invite));
      return structuredClone(invite);
    },

    async getInviteByTokenHash(tokenHash) {
      return (
        [...invitesById.values()].find(
          (invite) => invite.tokenHash === tokenHash,
        ) ?? null
      );
    },

    async getInviteByCredential(inviteQuery) {
      return (
        [...invitesById.values()].find((invite) =>
          Object.entries(inviteQuery).every(
            ([field, value]) => invite[field] === value,
          ),
        ) ?? null
      );
    },

    async getFamilyById(familyId) {
      return familiesById.get(familyId) ?? null;
    },

    async getUserById(userId) {
      return (
        [...usersByOpenId.values()].find((user) => user._id === userId) ?? null
      );
    },

    async joinFamilyWithInvite({
      inviteQuery,
      userId,
      profileManagementAllowed,
      membershipId,
      timestamp,
    }) {
      const invite = [...invitesById.values()].find(
        (candidate) =>
          Object.entries(inviteQuery).every(
            ([field, value]) => candidate[field] === value,
          ),
      );
      const existingMembership = invite
        ? [...membershipsById.values()].find(
            (membership) =>
              membership.familyId === invite.familyId &&
              membership.userId === userId,
          )
        : null;

      if (
        invite?.status === "used" &&
        invite.usedByUserId === userId &&
        existingMembership?.status === "active"
      ) {
        return {
          family: structuredClone(familiesById.get(invite.familyId)),
          membership: structuredClone(existingMembership),
        };
      }

      if (
        !invite ||
        invite.status !== "active" ||
        invite.expiresAt.getTime() <= timestamp.getTime()
      ) {
        return null;
      }

      if (existingMembership?.status === "active") {
        return {
          outcome: "already-member",
        };
      }

      const membership = existingMembership
        ? {
            ...existingMembership,
            role: "member",
            status: "active",
            profileManagementAllowed,
            joinedAt: timestamp,
            exitedAt: undefined,
            exitReason: undefined,
            revision: existingMembership.revision + 1,
            updatedAt: timestamp,
          }
        : {
            _id: membershipId,
            familyId: invite.familyId,
            userId,
            role: "member",
            status: "active",
            profileManagementAllowed,
            joinedAt: timestamp,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      membershipsById.set(membership._id, structuredClone(membership));
      invitesById.set(invite._id, {
        ...invite,
        status: "used",
        usedByUserId: userId,
        usedAt: timestamp,
        revision: invite.revision + 1,
        updatedAt: timestamp,
      });

      return {
        family: structuredClone(familiesById.get(invite.familyId)),
        membership: structuredClone(membership),
      };
    },

    async revokeInviteAsAdmin({ inviteId, userId, timestamp }) {
      const invite = invitesById.get(inviteId);

      if (
        !invite ||
        invite.status !== "active" ||
        invite.expiresAt.getTime() <= timestamp.getTime()
      ) {
        return {
          outcome: "unavailable",
        };
      }

      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === invite.familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (membership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const revokedInvite = {
        ...invite,
        status: "revoked",
        revokedByUserId: userId,
        revokedAt: timestamp,
        revision: invite.revision + 1,
        updatedAt: timestamp,
      };
      invitesById.set(invite._id, revokedInvite);

      return {
        outcome: "revoked",
        invite: structuredClone(revokedInvite),
      };
    },

    async setMembershipStatusForTest(membershipId, status) {
      const membership = membershipsById.get(membershipId);
      membershipsById.set(membershipId, {
        ...membership,
        status,
      });
    },

    async setMembershipRoleForTest(membershipId, role) {
      const membership = membershipsById.get(membershipId);
      membershipsById.set(membershipId, {
        ...membership,
        role,
      });
    },
  };
}

module.exports = {
  createInMemoryFamilyStore,
};
