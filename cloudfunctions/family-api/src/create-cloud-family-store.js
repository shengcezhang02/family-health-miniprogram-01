function createCloudFamilyStore(db) {
  const users = db.collection("users");
  const families = db.collection("families");
  const memberships = db.collection("family_memberships");
  const invites = db.collection("family_invites");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function getUserByOpenId(openId) {
    const result = await users.where({ wechatOpenId: openId }).limit(1).get();
    return result.data[0] ?? null;
  }

  async function findOne(collection, query) {
    const result = await collection.where(query).limit(1).get();
    return result.data[0] ?? null;
  }

  return {
    getUserByOpenId,

    async createUser(user) {
      try {
        await users.doc(user._id).set({
          data: withoutDocumentId(user),
        });
        return user;
      } catch (error) {
        const existingUser = await getUserByOpenId(user.wechatOpenId);

        if (existingUser) {
          return existingUser;
        }

        throw error;
      }
    },

    async createFamilyWithAdmin({ family, membership }) {
      await db.runTransaction(async (transaction) => {
        await transaction.collection("families").doc(family._id).set({
          data: withoutDocumentId(family),
        });
        await transaction
          .collection("family_memberships")
          .doc(membership._id)
          .set({
            data: withoutDocumentId(membership),
          });
      });
    },

    async listActiveFamiliesByUserId(userId) {
      const membershipResult = await memberships
        .where({
          userId,
          status: "active",
        })
        .get();

      const results = await Promise.all(
        membershipResult.data.map(async (membership) => {
          const familyResult = await families.doc(membership.familyId).get();

          if (!familyResult.data) {
            return null;
          }

          return {
            family: familyResult.data,
            membership,
          };
        }),
      );

      return results.filter(Boolean);
    },

    async getActiveMembership(familyId, userId) {
      return findOne(memberships, {
        familyId,
        userId,
        status: "active",
      });
    },

    async createInvite(invite) {
      await invites.doc(invite._id).set({
        data: withoutDocumentId(invite),
      });
      return invite;
    },

    async getInviteByTokenHash(tokenHash) {
      return findOne(invites, { tokenHash });
    },

    async getInviteByCredential(inviteQuery) {
      return findOne(invites, inviteQuery);
    },

    async getFamilyById(familyId) {
      return findOne(families, { _id: familyId });
    },

    async getUserById(userId) {
      return findOne(users, { _id: userId });
    },

    async joinFamilyWithInvite({
      inviteQuery,
      userId,
      profileManagementAllowed,
      membershipId,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const inviteResult = await transaction
          .collection("family_invites")
          .where(inviteQuery)
          .limit(1)
          .get();
        const invite = inviteResult.data[0] ?? null;
        const membershipResult = invite
          ? await transaction
              .collection("family_memberships")
              .where({
                familyId: invite.familyId,
                userId,
              })
              .limit(1)
              .get()
          : { data: [] };
        const existingMembership = membershipResult.data[0] ?? null;

        if (
          invite?.status === "used" &&
          invite.usedByUserId === userId &&
          existingMembership?.status === "active"
        ) {
          const familyResult = await transaction
            .collection("families")
            .doc(invite.familyId)
            .get();
          return {
            family: familyResult.data,
            membership: existingMembership,
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
              _id: existingMembership._id,
              familyId: invite.familyId,
              userId,
              role: "member",
              status: "active",
              profileManagementAllowed,
              joinedAt: timestamp,
              revision: existingMembership.revision + 1,
              createdAt: existingMembership.createdAt,
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
        const usedInvite = {
          ...invite,
          status: "used",
          usedByUserId: userId,
          usedAt: timestamp,
          revision: invite.revision + 1,
          updatedAt: timestamp,
        };

        await transaction
          .collection("family_memberships")
          .doc(membership._id)
          .set({
            data: withoutDocumentId(membership),
          });
        await transaction
          .collection("family_invites")
          .doc(invite._id)
          .set({
            data: withoutDocumentId(usedInvite),
          });
        const familyResult = await transaction
          .collection("families")
          .doc(invite.familyId)
          .get();

        return {
          family: familyResult.data,
          membership,
        };
      });
    },

    async revokeInviteAsAdmin({ inviteId, userId, timestamp }) {
      return db.runTransaction(async (transaction) => {
        const inviteResult = await transaction
          .collection("family_invites")
          .where({ _id: inviteId })
          .limit(1)
          .get();
        const invite = inviteResult.data[0] ?? null;

        if (
          !invite ||
          invite.status !== "active" ||
          invite.expiresAt.getTime() <= timestamp.getTime()
        ) {
          return {
            outcome: "unavailable",
          };
        }

        const membershipResult = await transaction
          .collection("family_memberships")
          .where({
            familyId: invite.familyId,
            userId,
            status: "active",
          })
          .limit(1)
          .get();
        const membership = membershipResult.data[0] ?? null;

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
        await transaction
          .collection("family_invites")
          .doc(invite._id)
          .set({
            data: withoutDocumentId(revokedInvite),
          });

        return {
          outcome: "revoked",
          invite: revokedInvite,
        };
      });
    },
  };
}

module.exports = {
  createCloudFamilyStore,
};
