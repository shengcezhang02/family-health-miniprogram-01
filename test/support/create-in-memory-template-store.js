const {
  findTemplateHistoryConflict,
} = require("../../cloudfunctions/template-api/src/template-history");

function createInMemoryTemplateStore({
  memberships = [],
  templates = [],
  records = [],
} = {}) {
  const templatesById = new Map(
    templates.map((template) => [
      template._id,
      structuredClone(template),
    ]),
  );

  return {
    async getActiveMembership(familyId, userId) {
      const membership = memberships.find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );
      return structuredClone(membership ?? null);
    },

    async listCustomTemplates(familyId, { includeInactive = false } = {}) {
      return [...templatesById.values()]
        .filter(
          (template) =>
            template.familyId === familyId &&
            (includeInactive || template.status === "active"),
        )
        .map((template) => structuredClone(template));
    },

    async createCustomTemplate(template) {
      const existing = templatesById.get(template._id);

      if (existing) {
        return {
          outcome: "replayed",
          template: structuredClone(existing),
        };
      }

      templatesById.set(template._id, structuredClone(template));
      return {
        outcome: "created",
        template: structuredClone(template),
      };
    },

    async updateCustomTemplate({
      familyId,
      templateId,
      expectedRevision,
      name,
      fields,
      updatedByUserId,
      updatedAt,
    }) {
      const existing = templatesById.get(templateId);

      if (!existing || existing.familyId !== familyId) {
        return {
          outcome: "not-found",
        };
      }

      if (existing.revision !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      if (findTemplateHistoryConflict(existing, fields, records)) {
        return {
          outcome: "history-conflict",
        };
      }

      const updated = {
        ...existing,
        name,
        fields: structuredClone(fields),
        updatedByUserId,
        updatedAt,
        revision: existing.revision + 1,
      };
      templatesById.set(templateId, updated);

      return {
        outcome: "updated",
        template: structuredClone(updated),
      };
    },

    async setTemplateStatus({
      familyId,
      templateId,
      expectedRevision,
      status,
      updatedByUserId,
      updatedAt,
    }) {
      const existing = templatesById.get(templateId);

      if (!existing || existing.familyId !== familyId) {
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
        updatedAt,
        revision: existing.revision + 1,
      };
      templatesById.set(templateId, updated);

      return {
        outcome: "updated",
        template: structuredClone(updated),
      };
    },

    inspectTemplates() {
      return [...templatesById.values()].map((template) =>
        structuredClone(template),
      );
    },

    inspectRecords() {
      return records.map((record) => structuredClone(record));
    },
  };
}

module.exports = {
  createInMemoryTemplateStore,
};
