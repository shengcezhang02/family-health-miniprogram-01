const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHealthItemApi,
} = require("../cloudfunctions/health-item-api/src/create-health-item-api");
const {
  getSystemTemplate,
} = require("../cloudfunctions/template-api/src/system-templates");
const {
  createInMemoryHealthItemStore,
} = require("./support/create-in-memory-health-item-store");

function createUser({
  id = "user-1",
  openId = "openid-1",
  displayName = "用户一",
} = {}) {
  return {
    _id: id,
    wechatOpenId: openId,
    displayName,
  };
}

function createMembership({
  id,
  familyId = "family-1",
  userId,
  status = "active",
} = {}) {
  return {
    _id: id ?? `${familyId}-${userId}`,
    familyId,
    userId,
    status,
  };
}

function createApiFor({
  caller = createUser(),
  subject = caller,
  memberships = [
    createMembership({
      userId: caller._id,
    }),
  ],
  templates = [],
  records = [],
  reminders = [],
  recurringRules = [],
  now = new Date("2026-07-29T01:30:00.000Z"),
  createRecordId = () => "record-1",
  createReminderId = () => "reminder-1",
  createRuleId = () => "rule-1",
  createCheckInRecordId = () => "record-for-reminder-1",
} = {}) {
  const healthItemStore = createInMemoryHealthItemStore({
    users: caller === subject ? [caller] : [caller, subject],
    memberships,
    templates,
    records,
    reminders,
    recurringRules,
  });
  const api = createHealthItemApi({
    getCaller: async () => structuredClone(caller),
    healthItemStore,
    getSystemTemplate,
    createRecordId,
    createReminderId,
    createRuleId,
    createCheckInRecordId,
    now: () => now,
  });

  return {
    api,
    healthItemStore,
  };
}

test("有效成员可以创建一份每天多个时间的周期规则", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({
    caller,
    now: new Date("2026-07-30T00:00:00.000Z"),
  });

  const result = await api.handle({
    action: "createRecurringRule",
    requestId: "req-create-temperature-rule",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      values: {},
      remark: "早晚测量",
      startDate: "2026-07-31",
      endDate: "2026-08-02",
      repeat: {
        type: "daily",
      },
      dailyTimes: ["20:00", "08:00", "08:00"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.rule.id, "rule-1");
  assert.deepEqual(result.data.rule.dailyTimes, ["08:00", "20:00"]);
  assert.equal(result.data.rule.status, "active");
  assert.deepEqual(healthItemStore.inspectRecurringRules(), [
    {
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
    },
  ]);
});

function createPendingReminder({
  id = "reminder-1",
  familyId = "family-1",
  subjectUserId = "user-1",
  revision = 1,
} = {}) {
  return {
    _id: id,
    familyId,
    subjectUserId,
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
    plannedAt: new Date("2026-07-29T03:00:00.000Z"),
    notificationTimes: [],
    notificationAttemptCount: 0,
    status: "pending",
    creationSource: "manual",
    dedupKey: `item:${id}`,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision,
    createdAt: new Date("2026-07-29T01:00:00.000Z"),
    updatedAt: new Date("2026-07-29T01:00:00.000Z"),
  };
}

function createRecurringRule({
  id = "rule-1",
  familyId = "family-1",
  subjectUserId = "user-1",
  status = "active",
  revision = 1,
} = {}) {
  return {
    _id: id,
    familyId,
    subjectUserId,
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
    status,
    ...(status === "paused"
      ? {
          pausedAt: new Date("2026-07-30T01:00:00.000Z"),
          pausedByUserId: "user-1",
          pauseReason: "manual",
        }
      : {}),
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
  };
}

test("周期规则支持周重复和隔日重复", async () => {
  const weekly = createApiFor({
    createRuleId: () => "rule-weekly",
  });
  const interval = createApiFor({
    createRuleId: () => "rule-interval",
  });

  const weeklyResult = await weekly.api.handle({
    action: "createRecurringRule",
    requestId: "req-weekly",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      values: {},
      startDate: "2026-07-31",
      endDate: "2026-08-31",
      repeat: {
        type: "weekly",
        weekdays: [5, 1, 5],
      },
      dailyTimes: ["08:00"],
    },
  });
  const intervalResult = await interval.api.handle({
    action: "createRecurringRule",
    requestId: "req-interval",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      values: {},
      startDate: "2026-07-31",
      endDate: "2026-08-31",
      repeat: {
        type: "interval_days",
        intervalDays: 2,
      },
      dailyTimes: ["08:00"],
    },
  });

  assert.equal(weeklyResult.ok, true);
  assert.deepEqual(weeklyResult.data.rule.repeat, {
    type: "weekly",
    weekdays: [1, 5],
  });
  assert.equal(intervalResult.ok, true);
  assert.deepEqual(intervalResult.data.rule.repeat, {
    type: "interval_days",
    intervalDays: 2,
  });
});

test("周期规则可以暂停和恢复并保留清楚的审计状态", async () => {
  const { api, healthItemStore } = createApiFor({
    recurringRules: [createRecurringRule()],
    now: new Date("2026-07-30T02:00:00.000Z"),
  });

  const paused = await api.handle({
    action: "pauseRule",
    data: {
      ruleId: "rule-1",
      expectedRevision: 1,
    },
  });
  const resumed = await api.handle({
    action: "resumeRule",
    data: {
      ruleId: "rule-1",
      expectedRevision: 2,
    },
  });

  assert.equal(paused.ok, true);
  assert.equal(paused.data.rule.status, "paused");
  assert.equal(paused.data.rule.pauseReason, "manual");
  assert.equal(
    paused.data.rule.pausedAt,
    "2026-07-30T02:00:00.000Z",
  );
  assert.equal(resumed.ok, true);
  assert.equal(resumed.data.rule.status, "active");
  assert.equal(Object.hasOwn(resumed.data.rule, "pausedAt"), false);
  assert.equal(
    healthItemStore.inspectRecurringRules()[0].revision,
    3,
  );
});

test("修改周期规则只改变可编辑内容并保留启用状态", async () => {
  const { api } = createApiFor({
    recurringRules: [createRecurringRule()],
    now: new Date("2026-07-30T03:00:00.000Z"),
  });

  const result = await api.handle({
    action: "updateHealthItem",
    data: {
      ruleId: "rule-1",
      expectedRevision: 1,
      values: {},
      remark: "改为工作日测量",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      repeat: {
        type: "weekly",
        weekdays: [1, 2, 3, 4, 5],
      },
      dailyTimes: ["09:00"],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.rule.status, "active");
  assert.equal(result.data.rule.startDate, "2026-08-01");
  assert.deepEqual(result.data.rule.dailyTimes, ["09:00"]);
  assert.equal(result.data.rule.revision, 2);
});

test("删除后恢复周期规则会保留删除前的暂停状态", async () => {
  const { api } = createApiFor({
    recurringRules: [
      createRecurringRule({
        status: "paused",
      }),
    ],
    now: new Date("2026-07-30T04:00:00.000Z"),
  });

  const deleted = await api.handle({
    action: "softDeleteItem",
    data: {
      ruleId: "rule-1",
      expectedRevision: 1,
    },
  });
  const restored = await api.handle({
    action: "restoreItem",
    data: {
      ruleId: "rule-1",
      expectedRevision: 2,
    },
  });

  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.rule.status, "paused");
  assert.equal(
    deleted.data.rule.deletedAt,
    "2026-07-30T04:00:00.000Z",
  );
  assert.equal(restored.ok, true);
  assert.equal(restored.data.rule.status, "paused");
  assert.equal(Object.hasOwn(restored.data.rule, "deletedAt"), false);
  assert.equal(restored.data.needsReconciliation, true);
});

function createCheckInRecord({
  id = "record-for-reminder-1",
  reminderId = "reminder-1",
  familyId = "family-1",
  subjectUserId = "user-1",
  revision = 1,
} = {}) {
  return {
    _id: id,
    familyId,
    subjectUserId,
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
    values: {
      temperature: 36.6,
    },
    occurredAt: new Date("2026-07-29T02:30:00.000Z"),
    recordSource: "reminder_check_in",
    sourceReminderId: reminderId,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision,
    createdAt: new Date("2026-07-29T01:30:00.000Z"),
    updatedAt: new Date("2026-07-29T01:30:00.000Z"),
    originRecordId: id,
  };
}

test("有效成员可以创建无需预填测量值的一次性提醒", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({
    caller,
  });

  const result = await api.handle({
    action: "createReminder",
    requestId: "req-create-temperature-reminder",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      plannedAt: "2026-07-29T03:00:00.000Z",
      notificationTimes: ["2026-07-29T02:50:00.000Z"],
      values: {},
      remark: "饭后测量",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.reminder.id, "reminder-1");
  assert.deepEqual(healthItemStore.inspectReminders(), [
    {
      _id: "reminder-1",
      familyId: "family-1",
      subjectUserId: caller._id,
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
      remark: "饭后测量",
      plannedAt: new Date("2026-07-29T03:00:00.000Z"),
      notificationTimes: [
        new Date("2026-07-29T02:50:00.000Z"),
      ],
      nextNotificationAt: new Date("2026-07-29T02:50:00.000Z"),
      notificationAttemptCount: 0,
      status: "pending",
      creationSource: "manual",
      dedupKey: "item:reminder-1",
      createdByUserId: caller._id,
      updatedByUserId: caller._id,
      revision: 1,
      createdAt: new Date("2026-07-29T01:30:00.000Z"),
      updatedAt: new Date("2026-07-29T01:30:00.000Z"),
    },
  ]);
});

test("有效家庭成员可以修改未打卡提醒的时间和备注", async () => {
  const caller = createUser();
  const reminder = createPendingReminder({
    subjectUserId: caller._id,
  });
  const { api, healthItemStore } = createApiFor({
    caller,
    reminders: [reminder],
    now: new Date("2026-07-29T01:40:00.000Z"),
  });

  const result = await api.handle({
    action: "updateHealthItem",
    requestId: "req-update-reminder",
    data: {
      reminderId: reminder._id,
      expectedRevision: 1,
      plannedAt: "2026-07-29T04:00:00.000Z",
      notificationTimes: [],
      values: {},
      remark: "改为午后测量",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.reminder.revision, 2);
  const [updated] = healthItemStore.inspectReminders();
  assert.deepEqual(updated.plannedAt, new Date("2026-07-29T04:00:00.000Z"));
  assert.equal(updated.remark, "改为午后测量");
  assert.equal(updated.status, "pending");
});

test("有效家庭成员可以读取提醒详情用于编辑或打卡", async () => {
  const caller = createUser();
  const reminder = createPendingReminder({
    subjectUserId: caller._id,
  });
  const { api } = createApiFor({
    caller,
    reminders: [reminder],
  });

  const result = await api.handle({
    action: "getHealthItem",
    requestId: "req-read-reminder",
    data: {
      reminderId: reminder._id,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.reminder.id, reminder._id);
  assert.equal(result.data.reminder.status, "pending");
});

test("提醒打卡会在同一业务动作中完成提醒并创建关联记录", async () => {
  const caller = createUser();
  const reminder = createPendingReminder({
    subjectUserId: caller._id,
  });
  const { api, healthItemStore } = createApiFor({
    caller,
    reminders: [reminder],
  });

  const result = await api.handle({
    action: "checkInReminder",
    requestId: "req-check-in-reminder",
    data: {
      reminderId: reminder._id,
      expectedRevision: 1,
      occurredAt: "2026-07-29T02:30:00.000Z",
      values: {
        temperature: 36.6,
      },
      remark: "提前测量",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.replayed, false);
  assert.equal(
    result.data.reminder.linkedRecordId,
    "record-for-reminder-1",
  );
  assert.equal(result.data.record.id, "record-for-reminder-1");
  assert.deepEqual(healthItemStore.inspectReminders(), [
    {
      ...reminder,
      status: "completed",
      completedAt: new Date("2026-07-29T01:30:00.000Z"),
      linkedRecordId: "record-for-reminder-1",
      updatedByUserId: caller._id,
      revision: 2,
      updatedAt: new Date("2026-07-29T01:30:00.000Z"),
    },
  ]);
  assert.deepEqual(healthItemStore.inspectRecords(), [
    {
      _id: "record-for-reminder-1",
      familyId: reminder.familyId,
      subjectUserId: caller._id,
      sourceTemplateType: "system",
      sourceTemplateId: "sys_temperature",
      templateNameSnapshot: "体温",
      fieldSchemaSnapshot: reminder.fieldSchemaSnapshot,
      values: {
        temperature: 36.6,
      },
      remark: "提前测量",
      occurredAt: new Date("2026-07-29T02:30:00.000Z"),
      recordSource: "reminder_check_in",
      sourceReminderId: reminder._id,
      createdByUserId: caller._id,
      updatedByUserId: caller._id,
      revision: 1,
      createdAt: new Date("2026-07-29T01:30:00.000Z"),
      updatedAt: new Date("2026-07-29T01:30:00.000Z"),
      originRecordId: "record-for-reminder-1",
    },
  ]);
});

test("同一提醒重复打卡只返回原有关联记录", async () => {
  const caller = createUser();
  const reminder = createPendingReminder({
    subjectUserId: caller._id,
  });
  const { api, healthItemStore } = createApiFor({
    caller,
    reminders: [reminder],
  });
  const request = {
    action: "checkInReminder",
    requestId: "req-repeat-check-in",
    data: {
      reminderId: reminder._id,
      expectedRevision: 1,
      occurredAt: "2026-07-29T02:30:00.000Z",
      values: {
        temperature: 36.6,
      },
    },
  };

  const first = await api.handle(request);
  const second = await api.handle(request);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.replayed, true);
  assert.equal(
    second.data.record.id,
    first.data.record.id,
  );
  assert.equal(healthItemStore.inspectRecords().length, 1);
});

test("删除打卡记录会同时把原提醒恢复为未打卡", async () => {
  const caller = createUser();
  const record = createCheckInRecord({
    subjectUserId: caller._id,
  });
  const pendingReminder = createPendingReminder({
    subjectUserId: caller._id,
  });
  const reminder = {
    ...pendingReminder,
    status: "completed",
    completedAt: new Date("2026-07-29T01:30:00.000Z"),
    linkedRecordId: record._id,
    revision: 2,
  };
  const { api, healthItemStore } = createApiFor({
    caller,
    records: [record],
    reminders: [reminder],
  });

  const result = await api.handle({
    action: "softDeleteItem",
    requestId: "req-delete-check-in-record",
    data: {
      recordId: record._id,
      expectedRevision: 1,
    },
  });

  assert.equal(result.ok, true);
  const [updatedReminder] = healthItemStore.inspectReminders();
  assert.equal(updatedReminder.status, "pending");
  assert.equal(updatedReminder.revision, 3);
  assert.equal(
    Object.hasOwn(updatedReminder, "linkedRecordId"),
    false,
  );
  assert.equal(
    Object.hasOwn(updatedReminder, "completedAt"),
    false,
  );
});

test("恢复打卡记录会在原提醒空闲时重新完成该提醒", async () => {
  const caller = createUser();
  const record = {
    ...createCheckInRecord({
      subjectUserId: caller._id,
      revision: 2,
    }),
    deletedAt: new Date("2026-07-29T01:40:00.000Z"),
    deletedByUserId: caller._id,
  };
  const reminder = {
    ...createPendingReminder({
      subjectUserId: caller._id,
      revision: 3,
    }),
    updatedAt: new Date("2026-07-29T01:40:00.000Z"),
  };
  const { api, healthItemStore } = createApiFor({
    caller,
    records: [record],
    reminders: [reminder],
    now: new Date("2026-07-29T01:50:00.000Z"),
  });

  const result = await api.handle({
    action: "restoreItem",
    requestId: "req-restore-check-in-record",
    data: {
      recordId: record._id,
      expectedRevision: 2,
    },
  });

  assert.equal(result.ok, true);
  const [updatedReminder] = healthItemStore.inspectReminders();
  assert.equal(updatedReminder.status, "completed");
  assert.equal(updatedReminder.linkedRecordId, record._id);
  assert.equal(updatedReminder.revision, 4);
  assert.deepEqual(
    updatedReminder.completedAt,
    new Date("2026-07-29T01:50:00.000Z"),
  );
});

test("原提醒已有新记录时阻止恢复旧打卡记录", async () => {
  const caller = createUser();
  const oldRecord = {
    ...createCheckInRecord({
      id: "old-record",
      subjectUserId: caller._id,
      revision: 2,
    }),
    deletedAt: new Date("2026-07-29T01:40:00.000Z"),
    deletedByUserId: caller._id,
  };
  const newRecord = createCheckInRecord({
    id: "new-record",
    subjectUserId: caller._id,
  });
  const reminder = {
    ...createPendingReminder({
      subjectUserId: caller._id,
      revision: 4,
    }),
    status: "completed",
    completedAt: new Date("2026-07-29T01:45:00.000Z"),
    linkedRecordId: newRecord._id,
  };
  const { api, healthItemStore } = createApiFor({
    caller,
    records: [oldRecord, newRecord],
    reminders: [reminder],
  });

  const result = await api.handle({
    action: "restoreItem",
    requestId: "req-restore-conflicting-record",
    data: {
      recordId: oldRecord._id,
      expectedRevision: 2,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "REMINDER_LINK_CONFLICT");
  assert.equal(
    healthItemStore
      .inspectRecords()
      .find((record) => record._id === oldRecord._id).deletedAt
      .toISOString(),
    "2026-07-29T01:40:00.000Z",
  );
});

test("有效成员可以为家庭中的有效成员创建体温记录", async () => {
  const caller = createUser();
  const subject = createUser({
    id: "user-2",
    openId: "openid-2",
    displayName: "用户二",
  });
  const { api, healthItemStore } = createApiFor({
    caller,
    subject,
    memberships: [
      createMembership({ userId: caller._id }),
      createMembership({ userId: subject._id }),
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-temperature",
    data: {
      familyId: "family-1",
      subjectUserId: subject._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.7,
      },
      remark: "晨起测量",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.record.id, "record-1");
  assert.deepEqual(healthItemStore.inspectRecords(), [
    {
      _id: "record-1",
      familyId: "family-1",
      subjectUserId: subject._id,
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
      values: {
        temperature: 36.7,
      },
      remark: "晨起测量",
      occurredAt: new Date("2026-07-29T01:20:00.000Z"),
      recordSource: "manual",
      createdByUserId: caller._id,
      updatedByUserId: caller._id,
      revision: 1,
      createdAt: new Date("2026-07-29T01:30:00.000Z"),
      updatedAt: new Date("2026-07-29T01:30:00.000Z"),
      originRecordId: "record-1",
    },
  ]);
});

test("家庭外用户不能读取家庭健康记录", async () => {
  const caller = createUser({
    id: "outsider",
    openId: "outsider-openid",
  });
  const { api } = createApiFor({
    caller,
    memberships: [],
    records: [
      {
        _id: "record-private",
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateType: "system",
        sourceTemplateId: "sys_temperature",
        templateNameSnapshot: "体温",
        fieldSchemaSnapshot: [],
        values: { temperature: 36.5 },
        occurredAt: new Date("2026-07-29T01:20:00.000Z"),
        recordSource: "manual",
        createdByUserId: "user-2",
        updatedByUserId: "user-2",
        revision: 1,
        createdAt: new Date("2026-07-29T01:20:00.000Z"),
        updatedAt: new Date("2026-07-29T01:20:00.000Z"),
        originRecordId: "record-private",
      },
    ],
  });

  const result = await api.handle({
    action: "getHealthItem",
    requestId: "req-outsider-read-record",
    data: {
      recordId: "record-private",
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-outsider-read-record",
    error: {
      code: "HEALTH_ITEM_ACCESS_DENIED",
      message: "只有当前家庭的有效成员可以查看记录",
    },
  });
});

test("云端忽略伪造审计人，并且不保存空备注", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({ caller });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-forged-audit-fields",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.8,
      },
      remark: "   ",
      createdByUserId: "forged-user",
      updatedByUserId: "forged-user",
      templateNameSnapshot: "伪造模板名",
    },
  });

  const [saved] = healthItemStore.inspectRecords();
  assert.equal(result.ok, true);
  assert.equal(saved.createdByUserId, caller._id);
  assert.equal(saved.updatedByUserId, caller._id);
  assert.equal(saved.templateNameSnapshot, "体温");
  assert.equal(Object.hasOwn(saved, "remark"), false);
});

test("同一用户使用同一个 requestId 重试不会产生两条记录", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({ caller });
  const request = {
    action: "createRecord",
    requestId: "req-retried-create",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.6,
      },
    },
  };

  const first = await api.handle(request);
  const retried = await api.handle(request);

  assert.equal(first.data.replayed, false);
  assert.equal(retried.data.replayed, true);
  assert.equal(first.data.record.id, retried.data.record.id);
  assert.equal(healthItemStore.inspectRecords().length, 1);
});

test("创建记录必须携带 requestId，避免不同保存被误判为重试", async () => {
  const { api } = createApiFor();

  const result = await api.handle({
    action: "createRecord",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.6,
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: undefined,
    error: {
      code: "INVALID_ARGUMENT",
      message: "缺少本次保存的请求编号，请重试",
    },
  });
});

test("使用自定义模板创建记录时保存独立字段快照", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({
    caller,
    templates: [
      {
        _id: "template-morning",
        familyId: "family-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: true,
            status: "active",
            sortOrder: 10,
          },
          {
            key: "field-old",
            label: "旧字段",
            type: "short_text",
            required: false,
            status: "inactive",
            sortOrder: 20,
          },
        ],
      },
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-custom-record",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateType: "custom",
      sourceTemplateId: "template-morning",
      occurredAt: "2026-07-29T04:10:00.000Z",
      values: {
        "field-mood": "精神很好",
      },
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.sourceTemplateType, "custom");
  assert.equal(saved.sourceTemplateId, "template-morning");
  assert.equal(saved.templateNameSnapshot, "晨间状态");
  assert.deepEqual(saved.fieldSchemaSnapshot, [
    {
      key: "field-mood",
      label: "晨间心情",
      type: "short_text",
      required: true,
      sortOrder: 10,
    },
  ]);
});

test("有效家庭成员可以编辑记录内容但记录结构保持不变", async () => {
  const originalRecord = {
    _id: "record-edit",
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
    values: {
      temperature: 36.6,
    },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-edit",
  };
  const { api, healthItemStore } = createApiFor({
    records: [originalRecord],
    now: new Date("2026-07-29T06:30:00.000Z"),
  });

  const result = await api.handle({
    action: "updateHealthItem",
    requestId: "req-update-record",
    data: {
      recordId: "record-edit",
      expectedRevision: 1,
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 37.1,
      },
      remark: "复测",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.record.revision, 2);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.values.temperature, 37.1);
  assert.equal(saved.remark, "复测");
  assert.deepEqual(
    saved.fieldSchemaSnapshot,
    originalRecord.fieldSchemaSnapshot,
  );
  assert.equal(saved.sourceTemplateId, originalRecord.sourceTemplateId);
  assert.equal(saved.createdAt.getTime(), originalRecord.createdAt.getTime());
});

test("两个成员基于同一版本编辑记录时拒绝后保存的一方", async () => {
  const record = {
    _id: "record-conflict",
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
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-conflict",
  };
  const { api } = createApiFor({
    records: [record],
    now: new Date("2026-07-29T06:30:00.000Z"),
  });
  const baseRequest = {
    action: "updateHealthItem",
    data: {
      recordId: "record-conflict",
      expectedRevision: 1,
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 37,
      },
    },
  };

  const first = await api.handle({
    ...baseRequest,
    requestId: "req-first-editor",
  });
  const second = await api.handle({
    ...baseRequest,
    requestId: "req-second-editor",
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, {
    ok: false,
    requestId: "req-second-editor",
    error: {
      code: "REVISION_CONFLICT",
      message: "记录已被其他人修改，请刷新后重试",
    },
  });
});

test("记录首次保存后不能更换所属人、模板或字段结构", async () => {
  const record = {
    _id: "record-locked",
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
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-locked",
  };
  const { api, healthItemStore } = createApiFor({
    records: [record],
  });

  const result = await api.handle({
    action: "updateHealthItem",
    requestId: "req-switch-template",
    data: {
      recordId: "record-locked",
      expectedRevision: 1,
      sourceTemplateId: "sys_blood_glucose",
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 36.8,
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-switch-template",
    error: {
      code: "LOCKED_FIELDS_CANNOT_CHANGE",
      message: "记录保存后不能更换所属人、模板或表单结构",
    },
  });
  assert.equal(healthItemStore.inspectRecords()[0].revision, 1);
});

test("记录软删除后不可见并且可以恢复", async () => {
  const record = {
    _id: "record-delete",
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
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-delete",
  };
  let now = new Date("2026-07-29T07:00:00.000Z");
  const healthItemStore = createInMemoryHealthItemStore({
    users: [createUser()],
    memberships: [createMembership({ userId: "user-1" })],
    records: [record],
  });
  const api = createHealthItemApi({
    getCaller: async () => createUser(),
    healthItemStore,
    getSystemTemplate,
    createRecordId: () => "unused",
    now: () => now,
  });

  const deleted = await api.handle({
    action: "softDeleteItem",
    requestId: "req-delete-record",
    data: {
      recordId: "record-delete",
      expectedRevision: 1,
    },
  });

  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.record.revision, 2);
  assert.equal(
    deleted.data.record.deletedAt,
    "2026-07-29T07:00:00.000Z",
  );

  const hidden = await api.handle({
    action: "getHealthItem",
    requestId: "req-read-deleted-record",
    data: {
      recordId: "record-delete",
    },
  });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.error.code, "HEALTH_ITEM_NOT_FOUND");

  now = new Date("2026-07-29T07:10:00.000Z");
  const restored = await api.handle({
    action: "restoreItem",
    requestId: "req-restore-record",
    data: {
      recordId: "record-delete",
      expectedRevision: 2,
    },
  });

  assert.equal(restored.ok, true);
  assert.equal(restored.data.record.revision, 3);
  assert.equal(Object.hasOwn(restored.data.record, "deletedAt"), false);

  const visible = await api.handle({
    action: "getHealthItem",
    requestId: "req-read-restored-record",
    data: {
      recordId: "record-delete",
    },
  });
  assert.equal(visible.ok, true);
});

test("自定义单选字段只接受模板中的启用选项", async () => {
  const { api, healthItemStore } = createApiFor({
    templates: [
      {
        _id: "template-mood",
        familyId: "family-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "精神状态",
            type: "single_choice",
            required: true,
            status: "active",
            sortOrder: 10,
            options: [
              {
                key: "option-good",
                label: "很好",
                status: "active",
                sortOrder: 10,
              },
              {
                key: "option-tired",
                label: "疲惫",
                status: "active",
                sortOrder: 20,
              },
            ],
          },
        ],
      },
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-choice-record",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateType: "custom",
      sourceTemplateId: "template-mood",
      occurredAt: "2026-07-29T07:30:00.000Z",
      values: {
        "field-mood": "option-good",
      },
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.values["field-mood"], "option-good");
  assert.deepEqual(saved.fieldSchemaSnapshot[0].options, [
    {
      key: "option-good",
      label: "很好",
      sortOrder: 10,
    },
    {
      key: "option-tired",
      label: "疲惫",
      sortOrder: 20,
    },
  ]);
});

test("创建记录时最多可以附加简短临时字段并锁定到快照", async () => {
  const { api, healthItemStore } = createApiFor();

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-record-with-temporary-field",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T08:00:00.000Z",
      values: {
        temperature: 36.7,
      },
      temporaryFields: [
        {
          label: "昨晚睡眠",
          value: "7 小时",
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.deepEqual(saved.fieldSchemaSnapshot.at(-1), {
    key: "temporary-1",
    label: "昨晚睡眠",
    type: "short_text",
    required: false,
    temporary: true,
    sortOrder: 20,
  });
  assert.equal(saved.values["temporary-1"], "7 小时");
});
