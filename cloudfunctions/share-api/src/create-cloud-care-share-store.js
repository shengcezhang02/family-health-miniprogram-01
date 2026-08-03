function createCloudCareShareStore(db) {
  const users = db.collection("users");
  const families = db.collection("families");
  const memberships = db.collection("family_memberships");
  const templates = db.collection("health_templates");
  const reminders = db.collection("one_time_reminders");
  const careShares = db.collection("care_shares");

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
      return findOne(users, { wechatOpenId: openId });
    },

    async getUserById(userId) {
      return findOne(users, { _id: userId });
    },

    async getFamilyById(familyId) {
      return findOne(families, { _id: familyId });
    },

    async getActiveMembership(familyId, userId) {
      return findOne(memberships, {
        familyId,
        userId,
        status: "active",
      });
    },

    async getReminderById(reminderId) {
      return findOne(reminders, { _id: reminderId });
    },

    async getCustomTemplate(familyId, templateId) {
      return findOne(templates, {
        _id: templateId,
        familyId,
      });
    },

    async getCareShareByTokenHash(tokenHash) {
      return findOne(careShares, { tokenHash });
    },

    async createCareShare(share) {
      return db.runTransaction(async (transaction) => {
        const transactionShares = transaction.collection("care_shares");
        const existingResult = await transactionShares
          .where({ _id: share._id })
          .limit(1)
          .get();
        const existing = existingResult.data[0] ?? null;

        if (existing) {
          return {
            share: existing,
            outcome: "replayed",
          };
        }

        await transactionShares.doc(share._id).set({
          data: withoutDocumentId(share),
        });
        return {
          share,
          outcome: "created",
        };
      });
    },

    async createImmediateCareShare({ share, reminder }) {
      return db.runTransaction(async (transaction) => {
        const transactionShares = transaction.collection("care_shares");
        const existingShareResult = await transactionShares
          .where({ _id: share._id })
          .limit(1)
          .get();
        const existingShare = existingShareResult.data[0] ?? null;

        if (existingShare) {
          const reminderResult = await transaction
            .collection("one_time_reminders")
            .where({ _id: existingShare.reminderId })
            .limit(1)
            .get();
          return {
            share: existingShare,
            reminder: reminderResult.data[0] ?? null,
            outcome: "replayed",
          };
        }

        const membershipResult = await transaction
          .collection("family_memberships")
          .where({
            familyId: share.familyId,
            status: "active",
          })
          .get();
        const activeUserIds = new Set(
          membershipResult.data.map((membership) => membership.userId),
        );

        if (
          !activeUserIds.has(share.senderUserId) ||
          !activeUserIds.has(share.subjectUserId)
        ) {
          return {
            outcome: "permission-denied",
          };
        }

        await transaction
          .collection("one_time_reminders")
          .doc(reminder._id)
          .set({
            data: withoutDocumentId(reminder),
          });
        await transactionShares.doc(share._id).set({
          data: withoutDocumentId(share),
        });

        return {
          share,
          reminder,
          outcome: "created",
        };
      });
    },
  };
}

module.exports = {
  createCloudCareShareStore,
};
