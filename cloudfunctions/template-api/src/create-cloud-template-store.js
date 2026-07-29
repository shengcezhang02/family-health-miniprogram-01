function createCloudTemplateStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");

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
  };
}

module.exports = {
  createCloudTemplateStore,
};
