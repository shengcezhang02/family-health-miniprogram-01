const {
  findTemplateHistoryConflict,
} = require("./template-history");

function createCloudTemplateStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const templates = db.collection("health_templates");

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

    async listCustomTemplates(familyId, { includeInactive = false } = {}) {
      const query = {
        familyId,
        ...(includeInactive ? {} : { status: "active" }),
      };
      const result = await templates.where(query).get();
      return result.data.sort(
        (left, right) =>
          (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
      );
    },

    async createCustomTemplate(template) {
      return db.runTransaction(async (transaction) => {
        const membershipResult = await transaction
          .collection("family_memberships")
          .where({
            familyId: template.familyId,
            userId: template.createdByUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!membershipResult.data[0]) {
          return {
            outcome: "permission-denied",
          };
        }

        const transactionTemplates =
          transaction.collection("health_templates");
        const existingResult = await transactionTemplates
          .where({
            _id: template._id,
          })
          .limit(1)
          .get();
        const existing = existingResult.data[0] ?? null;

        if (existing) {
          return {
            outcome: "replayed",
            template: existing,
          };
        }

        await transactionTemplates.doc(template._id).set({
          data: withoutDocumentId(template),
        });

        return {
          outcome: "created",
          template,
        };
      });
    },

    async updateCustomTemplate({
      familyId,
      templateId,
      expectedRevision,
      name,
      colorKey,
      colorHex,
      fields,
      updatedByUserId,
      updatedAt,
      mutationAudit = {},
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

        const transactionTemplates =
          transaction.collection("health_templates");
        const templateResult = await transactionTemplates
          .where({
            _id: templateId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = templateResult.data[0] ?? null;

        if (!existing) {
          return {
            outcome: "not-found",
          };
        }

        if (existing.revision !== expectedRevision) {
          return {
            outcome: "revision-conflict",
          };
        }

        const recordsResult = await transaction
          .collection("health_records")
          .where({
            familyId,
            sourceTemplateType: "custom",
            sourceTemplateId: templateId,
          })
          .limit(100)
          .get();

        if (
          findTemplateHistoryConflict(
            existing,
            fields,
            recordsResult.data,
          )
        ) {
          return {
            outcome: "history-conflict",
          };
        }

        const updated = {
          ...existing,
          name,
          colorKey,
          fields,
          updatedByUserId,
          ...mutationAudit,
          updatedAt,
          revision: existing.revision + 1,
        };
        if (colorKey === "custom") {
          updated.colorHex = colorHex;
        } else {
          delete updated.colorHex;
        }

        await transactionTemplates.doc(templateId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          template: updated,
        };
      });
    },

    async setTemplateStatus({
      familyId,
      templateId,
      expectedRevision,
      status,
      updatedByUserId,
      updatedAt,
      mutationAudit = {},
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

        const transactionTemplates =
          transaction.collection("health_templates");
        const templateResult = await transactionTemplates
          .where({
            _id: templateId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = templateResult.data[0] ?? null;

        if (!existing) {
          return {
            outcome: "not-found",
          };
        }

        if (existing.revision !== expectedRevision) {
          return {
            outcome: "revision-conflict",
          };
        }

        const updated = {
          ...existing,
          status,
          updatedByUserId,
          ...mutationAudit,
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionTemplates.doc(templateId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          template: updated,
        };
      });
    },
  };
}

module.exports = {
  createCloudTemplateStore,
};
