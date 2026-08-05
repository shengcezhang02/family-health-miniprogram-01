function normalizeDailyDisplayMode(value) {
  return value === "grouped" ? "grouped" : "mixed";
}

function matchesCommonFilters(item, filters) {
  return (
    (filters.memberId === "all" ||
      item.subject.id === filters.memberId) &&
    (filters.templateId === "all" ||
      item.sourceTemplateId === filters.templateId)
  );
}

function buildDailyHealthView({
  records = [],
  linkedRecords = [],
  reminders = [],
  recurringRules = [],
  filters = {},
} = {}) {
  const normalizedFilters = {
    memberId: filters.memberId || "all",
    templateId: filters.templateId || "all",
    itemType: filters.itemType || "all",
  };
  const filteredRecords =
    normalizedFilters.itemType === "all" ||
    normalizedFilters.itemType === "record"
      ? records.filter((record) =>
          matchesCommonFilters(record, normalizedFilters),
        )
      : [];
  const filteredReminders =
    normalizedFilters.itemType === "all" ||
    normalizedFilters.itemType === "reminder"
      ? reminders.filter((reminder) =>
          matchesCommonFilters(reminder, normalizedFilters),
        )
      : [];
  const filteredRules =
    normalizedFilters.itemType === "all" ||
    normalizedFilters.itemType === "rule"
      ? recurringRules.filter((rule) =>
          matchesCommonFilters(rule, normalizedFilters),
        )
      : [];
  const recordsByReminderId = new Map();
  const visibleReminderIds = new Set(
    filteredReminders.map((reminder) => reminder.id),
  );

  const linkableRecords = [
    ...new Map(
      filteredRecords
        .concat(
          linkedRecords.filter((record) =>
            matchesCommonFilters(record, normalizedFilters),
          ),
        )
        .map((record) => [record.id, record]),
    ).values(),
  ];

  if (visibleReminderIds.size > 0) {
    for (const record of linkableRecords) {
      if (
        !record.sourceReminderId ||
        !visibleReminderIds.has(record.sourceReminderId)
      ) {
        continue;
      }

      const linkedRecords =
        recordsByReminderId.get(record.sourceReminderId) || [];
      linkedRecords.push(record);
      recordsByReminderId.set(record.sourceReminderId, linkedRecords);
    }
  }

  const nestedRecordIds = new Set(
    [...recordsByReminderId.values()]
      .flat()
      .map((record) => record.id),
  );
  const timelineItems = filteredReminders
    .map((reminder) => ({
      kind: "reminder",
      id: reminder.id,
      sortAt: reminder.plannedAt,
      reminder,
      linkedRecords: recordsByReminderId.get(reminder.id) || [],
    }))
    .concat(
      filteredRecords
        .filter((record) => !nestedRecordIds.has(record.id))
        .map((record) => ({
          kind: "record",
          id: record.id,
          sortAt: record.occurredAt,
          record,
          linkedRecords: [],
        })),
    )
    .sort(
      (left, right) =>
        new Date(left.sortAt).getTime() -
        new Date(right.sortAt).getTime(),
    );

  return {
    records: filteredRecords,
    reminders: filteredReminders.map((reminder) => ({
      ...reminder,
      linkedRecords: recordsByReminderId.get(reminder.id) || [],
    })),
    recurringRules: filteredRules,
    timelineItems,
  };
}

module.exports = {
  buildDailyHealthView,
  normalizeDailyDisplayMode,
};
