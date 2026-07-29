function createInMemoryHealthItemStore({
  users = [],
  memberships = [],
  templates = [],
  records = [],
} = {}) {
  const usersByOpenId = new Map(
    users.map((user) => [user.wechatOpenId, structuredClone(user)]),
  );
  const membershipsById = new Map(
    memberships.map((membership) => [
      membership._id,
      structuredClone(membership),
    ]),
  );
  const recordsById = new Map(
    records.map((record) => [record._id, structuredClone(record)]),
  );
  const templatesById = new Map(
    templates.map((template) => [
      template._id,
      structuredClone(template),
    ]),
  );

  async function changeDeletionState({
    recordId,
    familyId,
    expectedRevision,
    updatedByUserId,
    updatedAt,
    shouldRestore,
  }) {
    const existing = recordsById.get(recordId);

    if (
      !existing ||
      existing.familyId !== familyId ||
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
    recordsById.set(recordId, updated);

    return {
      outcome: "updated",
      record: structuredClone(updated),
    };
  }

  return {
    async getUserByOpenId(openId) {
      return structuredClone(usersByOpenId.get(openId) ?? null);
    },

    async getActiveMembership(familyId, userId) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );
      return structuredClone(membership ?? null);
    },

    async getCustomTemplate(familyId, templateId) {
      const template = templatesById.get(templateId);

      return template?.familyId === familyId
        ? structuredClone(template)
        : null;
    },

    async createRecord(record) {
      const existing = recordsById.get(record._id);

      if (existing) {
        return {
          outcome: "replayed",
          record: structuredClone(existing),
        };
      }

      recordsById.set(record._id, structuredClone(record));
      return {
        outcome: "created",
        record: structuredClone(record),
      };
    },

    async getRecordById(recordId) {
      return structuredClone(recordsById.get(recordId) ?? null);
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
      const existing = recordsById.get(recordId);

      if (
        !existing ||
        existing.familyId !== familyId ||
        existing.deletedAt
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

      const { remark: previousRemark, ...recordWithoutRemark } = existing;
      const updated = {
        ...recordWithoutRemark,
        values: structuredClone(values),
        ...(remark ? { remark } : {}),
        occurredAt,
        updatedByUserId,
        updatedAt,
        revision: existing.revision + 1,
      };
      recordsById.set(recordId, updated);

      return {
        outcome: "updated",
        record: structuredClone(updated),
      };
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

    inspectRecords() {
      return [...recordsById.values()].map((record) =>
        structuredClone(record),
      );
    },
  };
}

module.exports = {
  createInMemoryHealthItemStore,
};
