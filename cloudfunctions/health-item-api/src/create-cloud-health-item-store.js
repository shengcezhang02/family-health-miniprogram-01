function createCloudHealthItemStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const records = db.collection("health_records");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

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

    async createRecord(record) {
      return db.runTransaction(async (transaction) => {
        const transactionRecords =
          transaction.collection("health_records");
        const existingResult = await transactionRecords
          .where({
            _id: record._id,
          })
          .limit(1)
          .get();
        const existing = existingResult.data[0] ?? null;

        if (existing) {
          return {
            outcome: "replayed",
            record: existing,
          };
        }

        await transactionRecords.doc(record._id).set({
          data: withoutDocumentId(record),
        });

        return {
          outcome: "created",
          record,
        };
      });
    },

    async getRecordById(recordId) {
      const result = await records.doc(recordId).get();
      return result.data ?? null;
    },
  };
}

module.exports = {
  createCloudHealthItemStore,
};
