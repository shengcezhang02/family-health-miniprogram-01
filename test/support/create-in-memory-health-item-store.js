function createInMemoryHealthItemStore({
  users = [],
  memberships = [],
  templates = [],
  records = [],
  reminders = [],
  recurringRules = [],
  careShares = [],
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
  const remindersById = new Map(
    reminders.map((reminder) => [
      reminder._id,
      structuredClone(reminder),
    ]),
  );
  const recurringRulesById = new Map(
    recurringRules.map((rule) => [
      rule._id,
      structuredClone(rule),
    ]),
  );
  const careSharesByTokenHash = new Map(
    careShares.map((share) => [
      share.tokenHash,
      structuredClone(share),
    ]),
  );

  async function changeDeletionState({
    recordId,
    familyId,
    expectedRevision,
    updatedByUserId,
    updatedAt,
    shouldRestore,
    mutationAudit = {},
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

    const sourceReminder = existing.sourceReminderId
      ? remindersById.get(existing.sourceReminderId)
      : null;

    if (
      shouldRestore &&
      sourceReminder &&
      !sourceReminder.deletedAt &&
      sourceReminder.status === "completed" &&
      sourceReminder.linkedRecordId !== recordId
    ) {
      return {
        outcome: "reminder-conflict",
      };
    }

    const {
      deletedAt: previousDeletedAt,
      deletedByUserId: previousDeletedByUserId,
      ...recordWithoutDeletion
    } = existing;
    const {
      sourceReminderId: previousSourceReminderId,
      ...recordWithoutSourceReminder
    } = recordWithoutDeletion;
    const restoredRecordBase =
      shouldRestore && (!sourceReminder || sourceReminder.deletedAt)
        ? recordWithoutSourceReminder
        : recordWithoutDeletion;
    const updated = {
      ...restoredRecordBase,
      ...(shouldRestore
        ? {}
        : {
            deletedAt: updatedAt,
            deletedByUserId: updatedByUserId,
          }),
      updatedByUserId,
      ...mutationAudit,
      updatedAt,
      revision: existing.revision + 1,
    };
    recordsById.set(recordId, updated);

    if (!shouldRestore && existing.sourceReminderId) {
      const reminder = remindersById.get(existing.sourceReminderId);

      if (
        reminder &&
        !reminder.deletedAt &&
        reminder.status === "completed" &&
        reminder.linkedRecordId === recordId
      ) {
        const {
          completedAt,
          linkedRecordId,
          ...reminderWithoutCompletion
        } = reminder;
        remindersById.set(existing.sourceReminderId, {
          ...reminderWithoutCompletion,
          status: "pending",
          updatedByUserId,
          ...mutationAudit,
          updatedAt,
          revision: reminder.revision + 1,
        });
      }
    }

    if (
      shouldRestore &&
      sourceReminder &&
      !sourceReminder.deletedAt &&
      sourceReminder.status === "pending"
    ) {
      remindersById.set(existing.sourceReminderId, {
        ...sourceReminder,
        status: "completed",
        completedAt: updatedAt,
        linkedRecordId: recordId,
        updatedByUserId,
        updatedAt,
        revision: sourceReminder.revision + 1,
      });
    }

    return {
      outcome: "updated",
      record: structuredClone(updated),
    };
  }

  return {
    async getCareShareByTokenHash(tokenHash) {
      return structuredClone(careSharesByTokenHash.get(tokenHash) ?? null);
    },

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

    async createReminder(reminder) {
      const existing = remindersById.get(reminder._id);

      if (existing) {
        return {
          outcome: "replayed",
          reminder: structuredClone(existing),
        };
      }

      remindersById.set(reminder._id, structuredClone(reminder));
      return {
        outcome: "created",
        reminder: structuredClone(reminder),
      };
    },

    async createRecurringRule(rule) {
      const existing = recurringRulesById.get(rule._id);

      if (existing) {
        return {
          outcome: "replayed",
          rule: structuredClone(existing),
        };
      }

      recurringRulesById.set(rule._id, structuredClone(rule));
      return {
        outcome: "created",
        rule: structuredClone(rule),
      };
    },

    async getRecurringRuleById(ruleId) {
      return structuredClone(recurringRulesById.get(ruleId) ?? null);
    },

    async updateRecurringRule({
      ruleId,
      familyId,
      expectedRevision,
      values,
      remark,
      startDate,
      endDate,
      repeat,
      dailyTimes,
      updatedByUserId,
      updatedAt,
      mutationAudit = {},
    }) {
      const existing = recurringRulesById.get(ruleId);

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

      const { remark: previousRemark, ...ruleWithoutRemark } = existing;
      const updated = {
        ...ruleWithoutRemark,
        values: structuredClone(values),
        ...(remark ? { remark } : {}),
        startDate,
        endDate,
        repeat: structuredClone(repeat),
        dailyTimes: structuredClone(dailyTimes),
        updatedByUserId,
        ...mutationAudit,
        updatedAt,
        revision: existing.revision + 1,
      };
      recurringRulesById.set(ruleId, updated);

      return {
        outcome: "updated",
        rule: structuredClone(updated),
      };
    },

    async setRecurringRuleStatus({
      ruleId,
      familyId,
      expectedRevision,
      expectedStatus,
      nextStatus,
      updatedByUserId,
      updatedAt,
      mutationAudit = {},
    }) {
      const existing = recurringRulesById.get(ruleId);

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

      if (existing.status !== expectedStatus) {
        return {
          outcome: "invalid-state",
        };
      }

      const {
        pausedAt,
        pausedByUserId,
        pauseReason,
        ...ruleWithoutPause
      } = existing;
      const updated = {
        ...ruleWithoutPause,
        status: nextStatus,
        ...(nextStatus === "paused"
          ? {
              pausedAt: updatedAt,
              pausedByUserId: updatedByUserId,
              pauseReason: "manual",
            }
          : {}),
        updatedByUserId,
        ...mutationAudit,
        updatedAt,
        revision: existing.revision + 1,
      };
      recurringRulesById.set(ruleId, updated);

      return {
        outcome: "updated",
        rule: structuredClone(updated),
      };
    },

    async changeRecurringRuleDeletionState({
      ruleId,
      familyId,
      expectedRevision,
      updatedByUserId,
      updatedAt,
      shouldRestore,
      mutationAudit = {},
    }) {
      const existing = recurringRulesById.get(ruleId);

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
        deletedAt,
        deletedByUserId,
        ...ruleWithoutDeletion
      } = existing;
      const updated = {
        ...ruleWithoutDeletion,
        ...(shouldRestore
          ? {}
          : {
              deletedAt: updatedAt,
              deletedByUserId: updatedByUserId,
            }),
        updatedByUserId,
        ...mutationAudit,
        updatedAt,
        revision: existing.revision + 1,
      };
      recurringRulesById.set(ruleId, updated);

      return {
        outcome: "updated",
        rule: structuredClone(updated),
      };
    },

    async getReminderById(reminderId) {
      return structuredClone(remindersById.get(reminderId) ?? null);
    },

    async changeReminderDeletionState({
      reminderId,
      familyId,
      expectedRevision,
      updatedByUserId,
      updatedAt,
      shouldRestore,
      mutationAudit = {},
    }) {
      const existing = remindersById.get(reminderId);
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === updatedByUserId &&
          candidate.status === "active",
      );

      if (!membership) {
        return { outcome: "permission-denied" };
      }

      if (
        !existing ||
        existing.familyId !== familyId ||
        (shouldRestore
          ? !existing.deletedAt
          : Boolean(existing.deletedAt))
      ) {
        return { outcome: "not-found" };
      }

      if (existing.revision !== expectedRevision) {
        return { outcome: "revision-conflict" };
      }

      const {
        deletedAt,
        deletedByUserId,
        ...reminderWithoutDeletion
      } = existing;
      const updated = {
        ...reminderWithoutDeletion,
        ...(!shouldRestore
          ? {
              deletedAt: updatedAt,
              deletedByUserId: updatedByUserId,
            }
          : {}),
        updatedByUserId,
        ...mutationAudit,
        updatedAt,
        revision: existing.revision + 1,
      };
      remindersById.set(reminderId, updated);

      return {
        outcome: "updated",
        reminder: structuredClone(updated),
      };
    },

    async checkInReminder({
      reminderId,
      familyId,
      expectedRevision,
      record,
      updatedByUserId,
      completedAt,
      mutationAudit = {},
    }) {
      const reminder = remindersById.get(reminderId);
      const callerMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === updatedByUserId &&
          membership.status === "active",
      );
      const subjectMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === reminder?.subjectUserId &&
          membership.status === "active",
      );

      if (!callerMembership || !subjectMembership) {
        return {
          outcome: "permission-denied",
        };
      }

      if (
        !reminder ||
        reminder.familyId !== familyId ||
        reminder.deletedAt
      ) {
        return {
          outcome: "not-found",
        };
      }

      if (
        reminder.status === "completed" &&
        reminder.linkedRecordId
      ) {
        return {
          outcome: "replayed",
          reminder: structuredClone(reminder),
          record: structuredClone(
            recordsById.get(reminder.linkedRecordId),
          ),
        };
      }

      if (reminder.revision !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      recordsById.set(record._id, structuredClone(record));
      const completedReminder = {
        ...reminder,
        status: "completed",
        completedAt,
        linkedRecordId: record._id,
        updatedByUserId,
        ...mutationAudit,
        updatedAt: completedAt,
        revision: reminder.revision + 1,
      };
      remindersById.set(reminderId, completedReminder);

      return {
        outcome: "completed",
        reminder: structuredClone(completedReminder),
        record: structuredClone(record),
      };
    },

    async updateReminder({
      reminderId,
      familyId,
      expectedRevision,
      values,
      remark,
      plannedAt,
      notificationTimes,
      updatedByUserId,
      updatedAt,
      mutationAudit = {},
    }) {
      const existing = remindersById.get(reminderId);

      if (
        !existing ||
        existing.familyId !== familyId ||
        existing.deletedAt
      ) {
        return {
          outcome: "not-found",
        };
      }

      if (existing.status !== "pending") {
        return {
          outcome: "already-completed",
        };
      }

      if (existing.revision !== expectedRevision) {
        return {
          outcome: "revision-conflict",
        };
      }

      const { remark: previousRemark, ...reminderWithoutRemark } =
        existing;
      const updated = {
        ...reminderWithoutRemark,
        values: structuredClone(values),
        ...(remark ? { remark } : {}),
        plannedAt,
        notificationTimes: structuredClone(notificationTimes),
        ...(notificationTimes[0]
          ? { nextNotificationAt: notificationTimes[0] }
          : {}),
        updatedByUserId,
        ...mutationAudit,
        updatedAt,
        revision: existing.revision + 1,
      };

      if (!notificationTimes[0]) {
        delete updated.nextNotificationAt;
      }

      remindersById.set(reminderId, updated);
      return {
        outcome: "updated",
        reminder: structuredClone(updated),
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
      mutationAudit = {},
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
        ...mutationAudit,
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

    inspectReminders() {
      return [...remindersById.values()].map((reminder) =>
        structuredClone(reminder),
      );
    },

    inspectRecurringRules() {
      return [...recurringRulesById.values()].map((rule) =>
        structuredClone(rule),
      );
    },
  };
}

module.exports = {
  createInMemoryHealthItemStore,
};
