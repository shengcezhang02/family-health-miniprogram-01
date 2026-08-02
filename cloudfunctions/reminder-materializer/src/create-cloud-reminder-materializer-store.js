function createCloudReminderMaterializerStore(db) {
  const recurringRules = db.collection("recurring_rules");
  const reminders = db.collection("one_time_reminders");
  const memberships = db.collection("family_memberships");
  const pageSize = 100;

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function listAll(collection, query) {
    const documents = [];

    for (let offset = 0; ; offset += pageSize) {
      let cursor = query ? collection.where(query) : collection;
      const result = await cursor
        .skip(offset)
        .limit(pageSize)
        .get();
      documents.push(...result.data);

      if (result.data.length < pageSize) {
        return documents;
      }
    }
  }

  return {
    async listRulesForReconciliation(
      windowStartDate,
      windowEndDate,
      familyId,
    ) {
      const rules = await listAll(
        recurringRules,
        familyId ? { familyId } : undefined,
      );

      return rules.filter(
        (rule) =>
          rule.startDate <= windowEndDate &&
          rule.endDate >= windowStartDate,
      );
    },

    async isSubjectActive(familyId, subjectUserId) {
      const result = await memberships
        .where({
          familyId,
          userId: subjectUserId,
          status: "active",
        })
        .limit(1)
        .get();
      return Boolean(result.data[0]);
    },

    async listFuturePendingReminders(ruleId, currentTime) {
      const generatedReminders = await listAll(reminders, {
        sourceRuleId: ruleId,
        status: "pending",
      });

      return generatedReminders.filter(
        (reminder) =>
          !reminder.deletedAt &&
          new Date(reminder.plannedAt).getTime() >= currentTime.getTime(),
      );
    },

    async createReminderIfAbsent(reminder) {
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

    async deleteReminder(reminderId) {
      await reminders.doc(reminderId).remove();
    },
  };
}

module.exports = {
  createCloudReminderMaterializerStore,
};
