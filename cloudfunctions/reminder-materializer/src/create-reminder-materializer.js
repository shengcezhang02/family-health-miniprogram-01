const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function toChinaDateString(value) {
  const chinaTime = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return chinaTime.toISOString().slice(0, 10);
}

function addDays(dateString, dayCount) {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return toChinaDateString(date);
}

function matchesRepeat(dateString, rule) {
  if (rule.repeat.type === "daily") {
    return true;
  }

  if (rule.repeat.type === "weekly") {
    const day = new Date(`${dateString}T12:00:00Z`).getUTCDay();
    const weekday = day === 0 ? 7 : day;
    return rule.repeat.weekdays.includes(weekday);
  }

  if (rule.repeat.type === "interval_days") {
    const start = new Date(`${rule.startDate}T00:00:00Z`);
    const current = new Date(`${dateString}T00:00:00Z`);
    const elapsedDays = Math.round(
      (current.getTime() - start.getTime()) / DAY_IN_MILLISECONDS,
    );
    return (
      elapsedDays % (rule.repeat.intervalDays + 1) === 0
    );
  }

  return false;
}

function createReminderMaterializer({
  store,
  now,
  createReminderId,
  windowDays = 30,
} = {}) {
  return {
    async materialize({ familyId } = {}) {
      const currentTime = now();
      const windowEnd = new Date(
        currentTime.getTime() + windowDays * DAY_IN_MILLISECONDS,
      );
      const windowStartDate = toChinaDateString(currentTime);
      const windowEndDate = toChinaDateString(windowEnd);
      const rules = await store.listRulesForReconciliation(
        windowStartDate,
        windowEndDate,
        familyId,
      );
      let createdReminderCount = 0;
      let replayedReminderCount = 0;
      let deletedReminderCount = 0;

      for (const rule of rules) {
        const subjectIsActive = await store.isSubjectActive(
          rule.familyId,
          rule.subjectUserId,
        );
        const shouldGenerate =
          !rule.deletedAt &&
          rule.status === "active" &&
          subjectIsActive;
        const startDate =
          rule.startDate > windowStartDate
            ? rule.startDate
            : windowStartDate;
        const endDate =
          rule.endDate < windowEndDate ? rule.endDate : windowEndDate;
        const desiredReminders = [];

        if (shouldGenerate) {
          for (
            let dateString = startDate;
            dateString <= endDate;
            dateString = addDays(dateString, 1)
          ) {
            if (!matchesRepeat(dateString, rule)) {
              continue;
            }

            for (const dailyTime of rule.dailyTimes) {
              const plannedAt = new Date(
                `${dateString}T${dailyTime}:00+08:00`,
              );

              if (
                plannedAt.getTime() < currentTime.getTime() ||
                plannedAt.getTime() > windowEnd.getTime()
              ) {
                continue;
              }

              desiredReminders.push({
                plannedAt,
                dedupKey: `rule:${rule._id}:${plannedAt.toISOString()}`,
              });
            }
          }
        }

        const desiredDedupKeys = new Set(
          desiredReminders.map((reminder) => reminder.dedupKey),
        );
        const existingFuturePending =
          await store.listFuturePendingReminders(
            rule._id,
            currentTime,
          );

        for (const reminder of existingFuturePending) {
          if (!desiredDedupKeys.has(reminder.dedupKey)) {
            await store.deleteReminder(reminder._id);
            deletedReminderCount += 1;
          }
        }

        for (const desired of desiredReminders) {
            const { plannedAt, dedupKey } = desired;
            const timestamp = now();
            const result = await store.createReminderIfAbsent({
              _id: createReminderId({
                dedupKey,
                ruleId: rule._id,
                plannedAt,
              }),
              familyId: rule.familyId,
              subjectUserId: rule.subjectUserId,
              sourceTemplateType: rule.sourceTemplateType,
              sourceTemplateId: rule.sourceTemplateId,
              templateNameSnapshot: rule.templateNameSnapshot,
              fieldSchemaSnapshot: rule.fieldSchemaSnapshot.map(
                (field) => ({
                  ...field,
                }),
              ),
              values: { ...rule.values },
              ...(rule.remark ? { remark: rule.remark } : {}),
              plannedAt,
              notificationTimes: [plannedAt],
              nextNotificationAt: plannedAt,
              notificationAttemptCount: 0,
              status: "pending",
              creationSource: "recurring_rule",
              sourceRuleId: rule._id,
              dedupKey,
              createdByUserId: rule.createdByUserId,
              updatedByUserId: rule.updatedByUserId,
              revision: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            });

            if (result.outcome === "created") {
              createdReminderCount += 1;
            } else {
              replayedReminderCount += 1;
            }
        }
      }

      return {
        scannedRuleCount: rules.length,
        createdReminderCount,
        replayedReminderCount,
        deletedReminderCount,
      };
    },
  };
}

module.exports = {
  createReminderMaterializer,
};
