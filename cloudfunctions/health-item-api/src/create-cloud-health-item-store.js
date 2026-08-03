function createCloudHealthItemStore(db) {
  const users = db.collection("users");
  const memberships = db.collection("family_memberships");
  const templates = db.collection("health_templates");
  const records = db.collection("health_records");
  const reminders = db.collection("one_time_reminders");
  const recurringRules = db.collection("recurring_rules");
  const careShares = db.collection("care_shares");

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

      let sourceReminder = null;
      let transactionReminders = null;

      if (shouldRestore && existing.sourceReminderId) {
        transactionReminders = transaction.collection(
          "one_time_reminders",
        );
        const reminderResult = await transactionReminders
          .where({
            _id: existing.sourceReminderId,
            familyId,
          })
          .limit(1)
          .get();
        sourceReminder = reminderResult.data[0] ?? null;

        if (
          sourceReminder &&
          !sourceReminder.deletedAt &&
          sourceReminder.status === "completed" &&
          sourceReminder.linkedRecordId !== recordId
        ) {
          return {
            outcome: "reminder-conflict",
          };
        }
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
        shouldRestore &&
        (!sourceReminder || sourceReminder.deletedAt)
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
        updatedAt,
        revision: existing.revision + 1,
      };

      await transactionRecords.doc(recordId).set({
        data: withoutDocumentId(updated),
      });

      if (!shouldRestore && existing.sourceReminderId) {
        transactionReminders = transaction.collection(
          "one_time_reminders",
        );
        const reminderResult = await transactionReminders
          .where({
            _id: existing.sourceReminderId,
            familyId,
          })
          .limit(1)
          .get();
        const reminder = reminderResult.data[0] ?? null;

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
          const pendingReminder = {
            ...reminderWithoutCompletion,
            status: "pending",
            updatedByUserId,
            updatedAt,
            revision: reminder.revision + 1,
          };
          await transactionReminders
            .doc(existing.sourceReminderId)
            .set({
              data: withoutDocumentId(pendingReminder),
            });
        }
      }

      if (
        shouldRestore &&
        sourceReminder &&
        !sourceReminder.deletedAt &&
        sourceReminder.status === "pending"
      ) {
        const completedReminder = {
          ...sourceReminder,
          status: "completed",
          completedAt: updatedAt,
          linkedRecordId: recordId,
          updatedByUserId,
          updatedAt,
          revision: sourceReminder.revision + 1,
        };
        await transactionReminders
          .doc(existing.sourceReminderId)
          .set({
            data: withoutDocumentId(completedReminder),
          });
      }

      return {
        outcome: "updated",
        record: updated,
      };
    });
  }

  return {
    async getCareShareByTokenHash(tokenHash) {
      return findOne(careShares, { tokenHash });
    },

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

    async createReminder(reminder) {
      return db.runTransaction(async (transaction) => {
        const transactionReminders = transaction.collection(
          "one_time_reminders",
        );
        const existingResult = await transactionReminders
          .where({
            _id: reminder._id,
          })
          .limit(1)
          .get();
        const existing = existingResult.data[0] ?? null;

        if (existing) {
          return {
            outcome: "replayed",
            reminder: existing,
          };
        }

        await transactionReminders.doc(reminder._id).set({
          data: withoutDocumentId(reminder),
        });

        return {
          outcome: "created",
          reminder,
        };
      });
    },

    async createRecurringRule(rule) {
      return db.runTransaction(async (transaction) => {
        const transactionRules =
          transaction.collection("recurring_rules");
        const existingResult = await transactionRules
          .where({
            _id: rule._id,
          })
          .limit(1)
          .get();
        const existing = existingResult.data[0] ?? null;

        if (existing) {
          return {
            outcome: "replayed",
            rule: existing,
          };
        }

        await transactionRules.doc(rule._id).set({
          data: withoutDocumentId(rule),
        });

        return {
          outcome: "created",
          rule,
        };
      });
    },

    async getRecurringRuleById(ruleId) {
      const result = await recurringRules.doc(ruleId).get();
      return result.data ?? null;
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

        const transactionRules =
          transaction.collection("recurring_rules");
        const ruleResult = await transactionRules
          .where({
            _id: ruleId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = ruleResult.data[0] ?? null;

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

        const { remark: previousRemark, ...ruleWithoutRemark } =
          existing;
        const updated = {
          ...ruleWithoutRemark,
          values,
          ...(remark ? { remark } : {}),
          startDate,
          endDate,
          repeat,
          dailyTimes,
          updatedByUserId,
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionRules.doc(ruleId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          rule: updated,
        };
      });
    },

    async setRecurringRuleStatus({
      ruleId,
      familyId,
      expectedRevision,
      expectedStatus,
      nextStatus,
      updatedByUserId,
      updatedAt,
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionMemberships = transaction.collection(
          "family_memberships",
        );
        const callerMembershipResult = await transactionMemberships
          .where({
            familyId,
            userId: updatedByUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!callerMembershipResult.data[0]) {
          return {
            outcome: "permission-denied",
          };
        }

        const transactionRules =
          transaction.collection("recurring_rules");
        const ruleResult = await transactionRules
          .where({
            _id: ruleId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = ruleResult.data[0] ?? null;

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

        if (existing.status !== expectedStatus) {
          return {
            outcome: "invalid-state",
          };
        }

        if (nextStatus === "active") {
          const subjectMembershipResult = await transactionMemberships
            .where({
              familyId,
              userId: existing.subjectUserId,
              status: "active",
            })
            .limit(1)
            .get();

          if (!subjectMembershipResult.data[0]) {
            return {
              outcome: "subject-inactive",
            };
          }
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
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionRules.doc(ruleId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          rule: updated,
        };
      });
    },

    async changeRecurringRuleDeletionState({
      ruleId,
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

        const transactionRules =
          transaction.collection("recurring_rules");
        const ruleResult = await transactionRules
          .where({
            _id: ruleId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = ruleResult.data[0] ?? null;

        if (
          !existing ||
          (shouldRestore
            ? !existing.deletedAt
            : Boolean(existing.deletedAt))
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
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionRules.doc(ruleId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          rule: updated,
        };
      });
    },

    async getReminderById(reminderId) {
      const result = await reminders.doc(reminderId).get();
      return result.data ?? null;
    },

    async checkInReminder({
      reminderId,
      familyId,
      expectedRevision,
      record,
      updatedByUserId,
      completedAt,
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionMemberships = transaction.collection(
          "family_memberships",
        );
        const callerMembershipResult = await transactionMemberships
          .where({
            familyId,
            userId: updatedByUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!callerMembershipResult.data[0]) {
          return {
            outcome: "permission-denied",
          };
        }

        const transactionReminders = transaction.collection(
          "one_time_reminders",
        );
        const reminderResult = await transactionReminders
          .where({
            _id: reminderId,
            familyId,
          })
          .limit(1)
          .get();
        const reminder = reminderResult.data[0] ?? null;

        if (!reminder || reminder.deletedAt) {
          return {
            outcome: "not-found",
          };
        }

        const subjectMembershipResult = await transactionMemberships
          .where({
            familyId,
            userId: reminder.subjectUserId,
            status: "active",
          })
          .limit(1)
          .get();

        if (!subjectMembershipResult.data[0]) {
          return {
            outcome: "permission-denied",
          };
        }

        const transactionRecords =
          transaction.collection("health_records");

        if (
          reminder.status === "completed" &&
          reminder.linkedRecordId
        ) {
          const linkedRecordResult = await transactionRecords
            .where({
              _id: reminder.linkedRecordId,
              familyId,
            })
            .limit(1)
            .get();

          return linkedRecordResult.data[0]
            ? {
                outcome: "replayed",
                reminder,
                record: linkedRecordResult.data[0],
              }
            : {
                outcome: "not-found",
              };
        }

        if (reminder.revision !== expectedRevision) {
          return {
            outcome: "revision-conflict",
          };
        }

        const completedReminder = {
          ...reminder,
          status: "completed",
          completedAt,
          linkedRecordId: record._id,
          updatedByUserId,
          updatedAt: completedAt,
          revision: reminder.revision + 1,
        };

        await transactionRecords.doc(record._id).set({
          data: withoutDocumentId(record),
        });
        await transactionReminders.doc(reminderId).set({
          data: withoutDocumentId(completedReminder),
        });

        return {
          outcome: "completed",
          reminder: completedReminder,
          record,
        };
      });
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
            outcome: "not-found",
          };
        }

        const transactionReminders = transaction.collection(
          "one_time_reminders",
        );
        const reminderResult = await transactionReminders
          .where({
            _id: reminderId,
            familyId,
          })
          .limit(1)
          .get();
        const existing = reminderResult.data[0] ?? null;

        if (!existing || existing.deletedAt) {
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

        const {
          remark: previousRemark,
          nextNotificationAt: previousNextNotificationAt,
          ...reminderWithoutOptionalFields
        } = existing;
        const updated = {
          ...reminderWithoutOptionalFields,
          values,
          ...(remark ? { remark } : {}),
          plannedAt,
          notificationTimes,
          ...(notificationTimes[0]
            ? { nextNotificationAt: notificationTimes[0] }
            : {}),
          notificationAttemptCount: 0,
          updatedByUserId,
          updatedAt,
          revision: existing.revision + 1,
        };

        await transactionReminders.doc(reminderId).set({
          data: withoutDocumentId(updated),
        });

        return {
          outcome: "updated",
          reminder: updated,
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
