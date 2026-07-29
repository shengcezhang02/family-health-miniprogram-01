function createCloudQueryStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const records = db.collection("health_records");

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
