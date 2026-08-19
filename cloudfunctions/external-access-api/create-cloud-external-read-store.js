function createCloudExternalReadStore(db) {
  const users = db.collection("users");
  const families = db.collection("families");
  const memberships = db.collection("family_memberships");
  const templates = db.collection("health_templates");
  const healthCollections = Object.freeze({
    record: db.collection("health_records"),
    reminder: db.collection("one_time_reminders"),
    recurring_rule: db.collection("recurring_rules"),
  });
  const DATABASE_PAGE_SIZE = 100;

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function listAll(collection, query) {
    const documents = [];

    for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
      const result = await collection
        .where(query)
        .skip(offset)
        .limit(DATABASE_PAGE_SIZE)
        .get();
      documents.push(...result.data);

      if (result.data.length < DATABASE_PAGE_SIZE) {
        return documents;
      }
    }
  }

  function getSortValue(itemType, item) {
    if (itemType === "record") {
      return new Date(item.occurredAt).getTime();
    }
    if (itemType === "reminder") {
      return new Date(item.plannedAt).getTime();
    }
    return new Date(`${item.startDate}T00:00:00.000Z`).getTime();
  }

  function matchesHealthItem(query, item) {
    if (item.deletedAt) {
      return false;
    }
    if (
      query.subjectUserId &&
      item.subjectUserId !== query.subjectUserId
    ) {
      return false;
    }
    if (
      query.templateType &&
      item.sourceTemplateType !== query.templateType
    ) {
      return false;
    }
    if (
      query.templateId &&
      item.sourceTemplateId !== query.templateId
    ) {
      return false;
    }

    if (query.itemType === "recurring_rule") {
      const startsAt = new Date(`${item.startDate}T00:00:00.000Z`).getTime();
      const endsAt = new Date(`${item.endDate}T23:59:59.999Z`).getTime();
      if (query.from && endsAt < query.from.getTime()) {
        return false;
      }
      if (query.to && startsAt > query.to.getTime()) {
        return false;
      }
    } else {
      const sortValue = getSortValue(query.itemType, item);
      if (query.from && sortValue < query.from.getTime()) {
        return false;
      }
      if (query.to && sortValue > query.to.getTime()) {
        return false;
      }
    }
    return true;
  }

  async function getFamilyContextByMembership(callerMembership) {
    const [familyResult, activeMemberships, customTemplates] =
      await Promise.all([
        families.doc(callerMembership.familyId).get(),
        listAll(memberships, {
            familyId: callerMembership.familyId,
            status: "active",
        }),
        listAll(templates, { familyId: callerMembership.familyId }),
      ]);
    const family = familyResult.data ?? null;

    if (!family) {
      return null;
    }

    const familyUsers = await Promise.all(
      activeMemberships.map(async (membership) => {
        const result = await users.doc(membership.userId).get();
        return result.data ?? null;
      }),
    );

    return {
      family,
      callerMembership,
      activeMemberships,
      users: familyUsers.filter(Boolean),
      customTemplates: customTemplates.filter(
        (template) => !template.deletedAt,
      ),
    };
  }

  return {
    async updateSystemTemplateSettings({
      actorUserId,
      familyId,
      systemTemplateId,
      expectedRevision,
      status,
      sortOrder,
      updatedAt = new Date(),
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionMemberships = transaction.collection(
          "family_memberships",
        );
        const membershipResult = await transactionMemberships
          .where({
            familyId,
            userId: actorUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!membershipResult.data[0]) {
          return { outcome: "permission-denied" };
        }

        const transactionFamilies = transaction.collection("families");
        const familyResult = await transactionFamilies.doc(familyId).get();
        const family = familyResult.data ?? null;

        if (!family) {
          return { outcome: "not-found" };
        }
        if (family.revision !== expectedRevision) {
          return { outcome: "revision-conflict" };
        }

        const setting = {
          templateId: systemTemplateId,
          status,
          sortOrder,
        };
        const existingSettings = Array.isArray(
          family.systemTemplateSettings,
        )
          ? family.systemTemplateSettings
          : [];
        const nextSettings = existingSettings.filter(
          (candidate) =>
            candidate?.templateId !== systemTemplateId &&
            candidate?.id !== systemTemplateId,
        );
        nextSettings.push(setting);
        const nextRevision = family.revision + 1;

        await transactionFamilies.doc(familyId).set({
          data: withoutDocumentId({
            ...family,
            systemTemplateSettings: nextSettings,
            revision: nextRevision,
            updatedAt,
            updatedByUserId: actorUserId,
          }),
        });

        return {
          outcome: "updated",
          familyRevision: nextRevision,
          setting,
        };
      });
    },

    async acceptExternalAccessNotice({
      userId,
      noticeVersion,
      acceptedAt,
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionMemberships = transaction.collection(
          "family_memberships",
        );
        const result = await transactionMemberships
          .where({ userId, status: "active" })
          .get();

        for (const membership of result.data) {
          await transactionMemberships.doc(membership._id).set({
            data: withoutDocumentId({
              ...membership,
              externalAccessNoticeVersion: noticeVersion,
              externalAccessNoticeAcceptedAt: acceptedAt,
              revision: (membership.revision || 0) + 1,
              updatedAt: acceptedAt,
            }),
          });
        }

        return { updatedCount: result.data.length };
      });
    },

    async listFamilyContextsByUserId(userId) {
      const [userResult, callerMemberships] = await Promise.all([
        users.doc(userId).get(),
        listAll(memberships, { userId, status: "active" }),
      ]);
      const familyContexts = await Promise.all(
        callerMemberships.map(getFamilyContextByMembership),
      );

      return {
        user: userResult.data ?? null,
        familyContexts: familyContexts.filter(Boolean),
      };
    },

    async getFamilyContextByUserId(familyId, userId) {
      const result = await memberships
        .where({ familyId, userId, status: "active" })
        .limit(1)
        .get();
      const callerMembership = result.data[0] ?? null;
      return callerMembership
        ? getFamilyContextByMembership(callerMembership)
        : null;
    },

    async listHealthItems(query) {
      const collection = healthCollections[query.itemType];
      const documents = await listAll(collection, {
        familyId: query.familyId,
      });
      return documents
        .filter((item) => matchesHealthItem(query, item))
        .sort((left, right) => {
          const timeDifference =
            getSortValue(query.itemType, right) -
            getSortValue(query.itemType, left);
          return timeDifference || right._id.localeCompare(left._id);
        })
        .slice(query.offset, query.offset + query.limit);
    },

    async getHealthItem({ familyId, itemType, itemId }) {
      const collection = healthCollections[itemType];
      const result = await collection.doc(itemId).get();
      const item = result.data ?? null;
      return item && item.familyId === familyId && !item.deletedAt
        ? item
        : null;
    },
  };
}

module.exports = {
  createCloudExternalReadStore,
};
