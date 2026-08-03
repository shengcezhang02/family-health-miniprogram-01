const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE_LABELS = {
  trend: "趋势",
  record_list: "记录列表",
  latest_data: "最新数据",
  reminder_completion: "提醒完成",
  recurring_rules: "周期提醒",
};
const TIME_RANGE_LABELS = {
  "7d": "近7天",
  "30d": "近30天",
  "90d": "近90天",
  all: "全部时间",
};
const WEEKDAY_LABELS = {
  1: "一",
  2: "二",
  3: "三",
  4: "四",
  5: "五",
  6: "六",
  7: "日",
};

function getRangeStart(timeRange, now) {
  const days = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  }[timeRange];

  return days ? new Date(now.getTime() - days * DAY_MS) : null;
}

function matchesCommonFilters(item, card, dateField, now) {
  if (
    card.memberIds.length > 0 &&
    !card.memberIds.includes(item.subject.id)
  ) {
    return false;
  }

  if (
    card.templateId &&
    item.sourceTemplateId !== card.templateId
  ) {
    return false;
  }

  const rangeStart = getRangeStart(card.timeRange, now);
  return (
    !rangeStart || new Date(item[dateField]).getTime() >= rangeStart.getTime()
  );
}

function buildFilterLabel(card, members) {
  const membersById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );
  const memberLabel =
    card.memberIds.length === 0
      ? "全部成员"
      : card.memberIds
          .map((memberId) => membersById.get(memberId))
          .filter(Boolean)
          .join("、") || "已退出成员";

  return `${memberLabel} · ${
    TIME_RANGE_LABELS[card.timeRange] || "近30天"
  }`;
}

function buildDashboardFilterControls(card, members) {
  const [memberLabel, rangeLabel] = buildFilterLabel(
    card,
    members,
  ).split(" · ");

  return {
    memberLabel: `成员：${memberLabel}`,
    rangeLabel: `范围：${rangeLabel}`,
  };
}

function filterRecords(records, card, now) {
  return records
    .filter((record) =>
      matchesCommonFilters(record, card, "occurredAt", now),
    )
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );
}

function buildLatestItems(records, card, members) {
  const membersById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );
  const recordsByMember = new Map();

  for (const record of records) {
    const memberRecords =
      recordsByMember.get(record.subject.id) || [];
    memberRecords.push(record);
    recordsByMember.set(record.subject.id, memberRecords);
  }

  return [...recordsByMember.entries()].map(
    ([memberId, memberRecords]) => {
      const record = memberRecords[0];
      const previous = memberRecords[1];
      const fields = (record.fieldSchemaSnapshot || []).filter(
        (field) =>
          card.fieldKeys.length === 0 ||
          card.fieldKeys.includes(field.key),
      );

      return {
        memberId,
        memberLabel:
          membersById.get(memberId) || record.subject.displayName,
        record,
        values: fields
          .filter((field) =>
            Object.prototype.hasOwnProperty.call(
              record.values || {},
              field.key,
            ),
          )
          .map((field) => {
            const value = record.values[field.key];
            const previousValue = previous?.values?.[field.key];
            const hasNumericChange =
              typeof value === "number" &&
              typeof previousValue === "number";

            return {
              key: field.key,
              label: field.label,
              value,
              unit: field.unit || "",
              ...(hasNumericChange
                ? {
                    change: Number(
                      (value - previousValue).toFixed(2),
                    ),
                  }
                : {}),
            };
          }),
      };
    },
  );
}

function buildTrendSeries(records, card, members) {
  const membersById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );
  const seriesByKey = new Map();

  for (const record of [...records].reverse()) {
    for (const field of record.fieldSchemaSnapshot || []) {
      const value = record.values?.[field.key];

      if (
        field.type !== "number" ||
        typeof value !== "number" ||
        (card.fieldKeys.length > 0 &&
          !card.fieldKeys.includes(field.key))
      ) {
        continue;
      }

      const key = `${record.subject.id}:${field.key}`;
      let series = seriesByKey.get(key);

      if (!series) {
        series = {
          key,
          label: `${
            membersById.get(record.subject.id) ||
            record.subject.displayName
          } · ${field.label}`,
          unit: field.unit || "",
          points: [],
        };
        seriesByKey.set(key, series);
      }

      series.points.push({
        recordId: record.id,
        occurredAt: record.occurredAt,
        value,
      });
    }
  }

  return [...seriesByKey.values()];
}

function buildReminderCompletion(reminders, card, now) {
  const dueReminders = reminders
    .filter(
      (reminder) =>
        matchesCommonFilters(
          reminder,
          card,
          "plannedAt",
          now,
        ) &&
        new Date(reminder.plannedAt).getTime() <= now.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(right.plannedAt).getTime() -
        new Date(left.plannedAt).getTime(),
    );
  const completed = dueReminders.filter(
    (reminder) => reminder.status === "completed",
  ).length;

  return {
    summary: {
      expected: dueReminders.length,
      completed,
      rate:
        dueReminders.length === 0
          ? 0
          : Math.round((completed / dueReminders.length) * 100),
    },
    items: dueReminders.filter(
      (reminder) => reminder.status !== "completed",
    ),
  };
}

function formatRuleSchedule(rule) {
  let repeatLabel = "每天";

  if (rule.repeat?.type === "weekly") {
    repeatLabel = `每周${(rule.repeat.weekdays || [])
      .map((weekday) => WEEKDAY_LABELS[weekday])
      .filter(Boolean)
      .join("、")}`;
  } else if (rule.repeat?.type === "interval_days") {
    repeatLabel = `间隔 ${rule.repeat.intervalDays} 天`;
  }

  return `${repeatLabel} · ${(rule.dailyTimes || []).join("、")}`;
}

function buildRecurringRuleItems(rules, card, members) {
  const membersById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );

  return rules
    .filter(
      (rule) =>
        (card.memberIds.length === 0 ||
          card.memberIds.includes(rule.subject.id)) &&
        (!card.templateId ||
          rule.sourceTemplateId === card.templateId),
    )
    .map((rule) => ({
      ...rule,
      memberLabel:
        membersById.get(rule.subject.id) ||
        rule.subject.displayName,
      scheduleLabel: formatRuleSchedule(rule),
      statusLabel:
        rule.status === "paused" ? "已暂停" : rule.datePhase,
    }));
}

function buildDashboardCardViews({
  cards,
  dashboardData,
  members = [],
  now = new Date(),
}) {
  return cards.map((card) => {
    const base = {
      ...card,
      typeLabel: TYPE_LABELS[card.type] || "健康卡片",
      filterLabel: buildFilterLabel(card, members),
      filterControls: buildDashboardFilterControls(card, members),
    };

    if (card.type === "record_list") {
      return {
        ...base,
        items: filterRecords(
          dashboardData.records || [],
          card,
          now,
        ),
      };
    }

    if (card.type === "latest_data") {
      return {
        ...base,
        items: buildLatestItems(
          filterRecords(
            dashboardData.records || [],
            card,
            now,
          ),
          card,
          members,
        ),
      };
    }

    if (card.type === "trend") {
      return {
        ...base,
        series: buildTrendSeries(
          filterRecords(
            dashboardData.records || [],
            card,
            now,
          ),
          card,
          members,
        ),
      };
    }

    if (card.type === "reminder_completion") {
      return {
        ...base,
        ...buildReminderCompletion(
          dashboardData.reminders || [],
          card,
          now,
        ),
      };
    }

    if (card.type === "recurring_rules") {
      return {
        ...base,
        items: buildRecurringRuleItems(
          dashboardData.recurringRules || [],
          card,
          members,
        ),
      };
    }

    return {
      ...base,
      items: [],
    };
  });
}

module.exports = {
  buildDashboardCardViews,
  buildDashboardFilterControls,
};
