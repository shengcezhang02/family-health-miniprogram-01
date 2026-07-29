function createCloudHealthItemStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const templates = db.collection("health_templates");
  const records = db.collection("health_records");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function findOne(collection, query) {
    const result = await collection.where(query).limit(1).get();
    return result.data[0] ?? null;
  }

  async function changeDeletionState({
    recordId,
    familyId,
    expectedRevision,
    updatedByUserId,
    updatedAt,
    shouldRestore,
  }) {
    return db.runTransaction(async (transaction) => {
      const membershipResult = await transaction
        .collection("family_memberships")
        .where({
          familyId,
          userId: updatedByUserId,
          status: "active",
        })
        .limit(1)
        .get();

      if (!membershipResult.data[0]) {
        return {
          outcome: "permission-denied",
        };
      }

      const transactionRecords =
        transaction.collection("health_records");
      const recordResult = await transactionRecords
        .where({
          _id: recordId,
          familyId,
        })
        .limit(1)
        .get();
      const existing = recordResult.data[0] ?? null;

      if (
        !existing ||
        (shouldRestore ? !existing.deletedAt : Boolean(existing.deletedAt))
      ) {
        return {
          outcome: "not-found",
        };
      }

      if (existing.revision !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      const {
        deletedAt: previousDeletedAt,
        deletedByUserId: previousDeletedByUserId,
        ...recordWithoutDeletion
      } = existing;
      const updated = {
        ...recordWithoutDeletion,
        ...(shouldRestore
          ? {}
          : {
              deletedAt: updatedAt,
              deletedByUserId: updatedByUserId,
            }),
        updatedByUserId,
        updatedAt,
        revision: existing.revision + 1,
      };

      await transactionRecords.doc(recordId).set({
        data: withoutDocumentId(updated),
      });

      return {
        outcome: "updated",
        record: updated,
      };
    });
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

    async getCustomTemplate(familyId, templateId) {
      return findOne(templates, {
        _id: templateId,
        familyId,
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

    async updateRecord({
      recordId,
      familyId,
      expectedRevision,
      values,
      remark,
      occurredAt,
      updatedByUserId,
      updatedAt,
    }) {
      return db.runTransaction(async (transaction) => {
        const membershipResult = await transaction
          .collection("family_memberships")
          .where({
            familyId,
            userId: updatedByUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!membershipResult.data[0]) {
          return {
            outcome: "permission-denied",
          };
        }

        const transactionRecords =
          transaction.collection("health_records");
        const recordResult = await transactionRecords
          .where({
            _id: recordId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = recordResult.data[0] ?? null;

        if (!existing || existing.deletedAt) {
          return {
            outcome: "not-found",
          };
        }

        if (existing.revision !== expectedRevision) {
          return {
            outcome: "revision-conflict",
          };
        }

        const { remark: previousRemark, ...recordWithoutRemark } = existing;
        const updated = {
          ...recordWithoutRemark,
          values,
          ...(remark ? { remark } : {}),
          occurredAt,
          updatedByUserId,
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionRecords.doc(recordId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          record: updated,
        };
      });
    },

    async softDeleteRecord(options) {
      return changeDeletionState({
        ...options,
        shouldRestore: false,
      });
    },

    async restoreRecord(options) {
      return changeDeletionState({
        ...options,
        shouldRestore: true,
      });
    },
  };
}

module.exports = {
  createCloudHealthItemStore,
};
