function createCloudProfileStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const profiles = db.collection("health_profiles");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function findOne(collection, query) {
    const result = await collection.where(query).limit(1).get();
    return result.data[0] ?? null;
  }

  async function findMembershipInTransaction(
    transaction,
    familyId,
    userId,
  ) {
    const result = await transaction
      .collection("family_memberships")
      .where({
        familyId,
        userId,
        status: "active",
      })
      .limit(1)
      .get();
    return result.data[0] ?? null;
  }

  async function saveProfileInTransaction({
    transaction,
    ownerUserId,
    actorUserId,
    viaFamilyId,
    profileId,
    expectedRevision,
    values,
    timestamp,
  }) {
    const result = await transaction
      .collection("health_profiles")
      .where({
        userId: ownerUserId,
      })
      .limit(1)
      .get();
    const existing = result.data[0] ?? null;

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
      updatedByUserId: actorUserId,
      ...(viaFamilyId ? { updatedViaFamilyId: viaFamilyId } : {}),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await transaction
      .collection("health_profiles")
      .doc(profile._id)
      .set({
        data: withoutDocumentId(profile),
      });

    return {
      outcome: "saved",
      profile,
    };
  }

  return {
    async getUserByOpenId(openId) {
      return findOne(users, {
        wechatOpenId: openId,
      });
    },

    async getUserById(userId) {
      const result = await users.doc(userId).get();
      return result.data ?? null;
    },

    async getProfileByUserId(userId) {
      return findOne(profiles, {
        userId,
      });
    },

    async getActiveMembership(familyId, userId) {
      return findOne(memberships, {
        familyId,
        userId,
        status: "active",
      });
    },

    async listActiveFamilyMembers(familyId) {
      const result = await memberships
        .where({
          familyId,
          status: "active",
        })
        .get();
      const entries = await Promise.all(
        result.data.map(async (membership) => {
          const userResult = await users.doc(membership.userId).get();

          if (!userResult.data) {
            return null;
          }

          return {
            user: userResult.data,
            membership,
          };
        }),
      );

      return entries.filter(Boolean);
    },

    async saveOwnProfile({
      userId,
      profileId,
      expectedRevision,
      values,
      timestamp,
    }) {
      return db.runTransaction((transaction) =>
        saveProfileInTransaction({
          transaction,
          ownerUserId: userId,
          actorUserId: userId,
          profileId,
          expectedRevision,
          values,
          timestamp,
        }),
      );
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
      return db.runTransaction(async (transaction) => {
        const [callerMembership, ownerMembership] = await Promise.all([
          findMembershipInTransaction(
            transaction,
            familyId,
            callerUserId,
          ),
          findMembershipInTransaction(
            transaction,
            familyId,
            ownerUserId,
          ),
        ]);

        if (
          !callerMembership ||
          !ownerMembership ||
          ownerMembership.profileManagementAllowed !== true
        ) {
          return {
            outcome: "permission-denied",
          };
        }

        return saveProfileInTransaction({
          transaction,
          ownerUserId,
          actorUserId: callerUserId,
          viaFamilyId: familyId,
          profileId,
          expectedRevision,
          values,
          timestamp,
        });
      });
    },

    async setProfileManagementAllowed({
      familyId,
      userId,
      allowed,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const membership = await findMembershipInTransaction(
          transaction,
          familyId,
          userId,
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
        await transaction
          .collection("family_memberships")
          .doc(updated._id)
          .set({
            data: withoutDocumentId(updated),
          });

        return {
          outcome: "updated",
          membership: updated,
        };
      });
    },
  };
}

module.exports = {
  createCloudProfileStore,
};
