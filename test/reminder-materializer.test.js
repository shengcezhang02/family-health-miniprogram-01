const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createReminderMaterializer,
} = require("../cloudfunctions/reminder-materializer/src/create-reminder-materializer");

function createInMemoryMaterializerStore({
  rules = [],
  reminders = [],
  inactiveSubjectUserIds = [],
} = {}) {
  const rulesById = new Map(
    rules.map((rule) => [rule._id, structuredClone(rule)]),
  );
  const remindersByDedupKey = new Map(
    reminders.map((reminder) => [
      reminder.dedupKey,
      structuredClone(reminder),
    ]),
  );
  const inactiveSubjects = new Set(inactiveSubjectUserIds);

  return {
    async listRulesForReconciliation() {
      return [...rulesById.values()]
        .map((rule) => structuredClone(rule));
    },

    async isSubjectActive(familyId, subjectUserId) {
      return !inactiveSubjects.has(`${familyId}:${subjectUserId}`);
    },

    async listFuturePendingReminders(ruleId, currentTime) {
      return [...remindersByDedupKey.values()]
        .filter(
          (reminder) =>
            reminder.sourceRuleId === ruleId &&
            reminder.status === "pending" &&
            !reminder.deletedAt &&
            reminder.plannedAt.getTime() >= currentTime.getTime(),
        )
        .map((reminder) => structuredClone(reminder));
    },

    async createReminderIfAbsent(reminder) {
      const existing = remindersByDedupKey.get(reminder.dedupKey);

      if (existing) {
        return {
          outcome: "replayed",
          reminder: structuredClone(existing),
        };
      }

      remindersByDedupKey.set(
        reminder.dedupKey,
        structuredClone(reminder),
      );
      return {
        outcome: "created",
        reminder: structuredClone(reminder),
      };
    },

    async deleteReminder(reminderId) {
      const entry = [...remindersByDedupKey.entries()].find(
        ([, reminder]) => reminder._id === reminderId,
      );

      if (entry) {
        remindersByDedupKey.delete(entry[0]);
      }
    },

    setRule(rule) {
      rulesById.set(rule._id, structuredClone(rule));
    },

    updateReminder(dedupKey, update) {
      remindersByDedupKey.set(
        dedupKey,
        structuredClone({
          ...remindersByDedupKey.get(dedupKey),
          ...update,
        }),
      );
    },

    inspectReminders() {
      return [...remindersByDedupKey.values()].map((reminder) =>
        structuredClone(reminder),
      );
    },
  };
}

function createDailyRule() {
  return {
    _id: "rule-1",
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: {},
    remark: "早晚测量",
    startDate: "2026-07-31",
    endDate: "2026-08-02",
    repeat: {
      type: "daily",
    },
    dailyTimes: ["08:00", "20:00"],
    status: "active",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };
}

test("未来三天每天两个时间重复调度仍只生成六条提醒", async () => {
  const store = createInMemoryMaterializerStore({
    rules: [createDailyRule()],
  });
  const materializer = createReminderMaterializer({
    store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createReminderId: ({ dedupKey }) => `reminder:${dedupKey}`,
  });

  const first = await materializer.materialize();
  const second = await materializer.materialize();
  const reminders = store.inspectReminders();

  assert.deepEqual(first, {
    scannedRuleCount: 1,
    createdReminderCount: 6,
    replayedReminderCount: 0,
    deletedReminderCount: 0,
  });
  assert.deepEqual(second, {
    scannedRuleCount: 1,
    createdReminderCount: 0,
    replayedReminderCount: 6,
    deletedReminderCount: 0,
  });
  assert.equal(reminders.length, 6);
  assert.deepEqual(
    reminders.map((reminder) => reminder.plannedAt.toISOString()),
    [
      "2026-07-31T00:00:00.000Z",
      "2026-07-31T12:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-08-01T12:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-02T12:00:00.000Z",
    ],
  );
  assert.ok(
    reminders.every(
      (reminder) =>
        reminder.creationSource === "recurring_rule" &&
        reminder.sourceRuleId === "rule-1" &&
        reminder.status === "pending",
    ),
  );
});

test("周重复和间隔重复只生成命中的日期", async () => {
  const weeklyRule = {
    ...createDailyRule(),
    _id: "rule-weekly",
    repeat: {
      type: "weekly",
      weekdays: [5, 7],
    },
  };
  const intervalRule = {
    ...createDailyRule(),
    _id: "rule-interval",
    repeat: {
      type: "interval_days",
      intervalDays: 2,
    },
    dailyTimes: ["09:00"],
  };
  const store = createInMemoryMaterializerStore({
    rules: [weeklyRule, intervalRule],
  });
  const materializer = createReminderMaterializer({
    store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createReminderId: ({ dedupKey }) => `reminder:${dedupKey}`,
  });

  const result = await materializer.materialize();
  const reminders = store.inspectReminders();

  assert.equal(result.createdReminderCount, 5);
  assert.deepEqual(
    reminders
      .filter((reminder) => reminder.sourceRuleId === "rule-weekly")
      .map((reminder) => reminder.plannedAt.toISOString()),
    [
      "2026-07-31T00:00:00.000Z",
      "2026-07-31T12:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
      "2026-08-02T12:00:00.000Z",
    ],
  );
  assert.deepEqual(
    reminders
      .filter((reminder) => reminder.sourceRuleId === "rule-interval")
      .map((reminder) => reminder.plannedAt.toISOString()),
    [
      "2026-07-31T01:00:00.000Z",
    ],
  );
});

test("每隔一天表示两个计划日之间完整空出一天", async () => {
  const intervalRule = {
    ...createDailyRule(),
    _id: "rule-gap-one-day",
    repeat: {
      type: "interval_days",
      intervalDays: 1,
    },
    dailyTimes: ["09:00"],
  };
  const store = createInMemoryMaterializerStore({
    rules: [intervalRule],
  });
  const materializer = createReminderMaterializer({
    store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createReminderId: ({ dedupKey }) => `reminder:${dedupKey}`,
  });

  await materializer.materialize();

  assert.deepEqual(
    store
      .inspectReminders()
      .map((reminder) => reminder.plannedAt.toISOString()),
    [
      "2026-07-31T01:00:00.000Z",
      "2026-08-02T01:00:00.000Z",
    ],
  );
});

test("暂停后清理未来未打卡提醒，恢复后只补未来缺失提醒", async () => {
  const activeRule = createDailyRule();
  const store = createInMemoryMaterializerStore({
    rules: [activeRule],
  });
  const materializer = createReminderMaterializer({
    store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createReminderId: ({ dedupKey }) => `reminder:${dedupKey}`,
  });

  await materializer.materialize();
  const completedDedupKey =
    "rule:rule-1:2026-08-01T00:00:00.000Z";
  store.updateReminder(completedDedupKey, {
    status: "completed",
    linkedRecordId: "record-1",
    completedAt: new Date("2026-07-30T04:00:00.000Z"),
  });
  store.setRule({
    ...activeRule,
    status: "paused",
    pausedAt: new Date("2026-07-30T05:00:00.000Z"),
    pausedByUserId: "user-1",
    pauseReason: "manual",
  });

  const pausedRun = await materializer.materialize();

  assert.equal(pausedRun.createdReminderCount, 0);
  assert.equal(pausedRun.deletedReminderCount, 5);
  assert.deepEqual(
    store.inspectReminders().map((reminder) => reminder.dedupKey),
    [completedDedupKey],
  );

  store.setRule(activeRule);
  const resumedRun = await materializer.materialize();

  assert.equal(resumedRun.createdReminderCount, 5);
  assert.equal(resumedRun.replayedReminderCount, 1);
  assert.equal(store.inspectReminders().length, 6);
});

test("改时间只替换未来未打卡提醒并保留已完成提醒", async () => {
  const originalRule = createDailyRule();
  const store = createInMemoryMaterializerStore({
    rules: [originalRule],
  });
  const materializer = createReminderMaterializer({
    store,
    now: () => new Date("2026-07-30T00:00:00.000Z"),
    createReminderId: ({ dedupKey }) => `reminder:${dedupKey}`,
  });

  await materializer.materialize();
  const completedDedupKey =
    "rule:rule-1:2026-08-01T00:00:00.000Z";
  store.updateReminder(completedDedupKey, {
    status: "completed",
    linkedRecordId: "record-1",
    completedAt: new Date("2026-07-30T04:00:00.000Z"),
  });
  store.setRule({
    ...originalRule,
    dailyTimes: ["09:00"],
  });

  const result = await materializer.materialize();
  const reminders = store.inspectReminders();

  assert.equal(result.deletedReminderCount, 5);
  assert.equal(result.createdReminderCount, 3);
  assert.ok(
    reminders.some(
      (reminder) =>
        reminder.dedupKey === completedDedupKey &&
        reminder.status === "completed",
    ),
  );
  assert.deepEqual(
    reminders
      .filter((reminder) => reminder.status === "pending")
      .map((reminder) => reminder.plannedAt.toISOString()),
    [
      "2026-07-31T01:00:00.000Z",
      "2026-08-01T01:00:00.000Z",
      "2026-08-02T01:00:00.000Z",
    ],
  );
});
