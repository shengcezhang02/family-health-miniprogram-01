function createCloudFamilyStore(db) {
  const users = db.collection("users");
  const families = db.collection("families");
  const memberships = db.collection("family_memberships");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function getUserByOpenId(openId) {
    const result = await users.where({ wechatOpenId: openId }).limit(1).get();
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
  };
}

module.exports = {
  createCloudFamilyStore,
};
