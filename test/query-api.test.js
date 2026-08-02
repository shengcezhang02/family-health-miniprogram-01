const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createQueryApi,
} = require("../cloudfunctions/query-api/src/create-query-api");
const {
  createInMemoryQueryStore,
} = require("./support/create-in-memory-query-store");

function createRecord({
  id,
  familyId = "family-1",
  subjectUserId = "user-1",
  occurredAt,
  deletedAt,
  remark,
}) {
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
    values: { temperature: id === "newer" ? 36.8 : 36.5 },
    ...(remark ? { remark } : {}),
    occurredAt: new Date(occurredAt),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date(occurredAt),
    updatedAt: new Date(occurredAt),
    originRecordId: id,
    ...(deletedAt ? { deletedAt: new Date(deletedAt) } : {}),
  };
}

function createReminder({
  id,
  familyId = "family-1",
  subjectUserId = "user-1",
  plannedAt,
  notificationTimes = [],
  status = "pending",
}) {
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
    plannedAt: new Date(plannedAt),
    notificationTimes: notificationTimes.map((value) => new Date(value)),
    notificationAttemptCount: 0,
    status,
    creationSource: "manual",
    dedupKey: `item:${id}`,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T00:00:00.000Z"),
    updatedAt: new Date("2026-07-29T00:00:00.000Z"),
  };
}

function createRecurringRule({
  id,
  familyId = "family-1",
  subjectUserId = "user-1",
  startDate = "2026-07-31",
  endDate = "2026-08-31",
  repeat = {
    type: "daily",
  },
  status = "active",
  deletedAt,
}) {
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
    startDate,
    endDate,
    repeat,
    dailyTimes: ["08:00", "20:00"],
    status,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T00:00:00.000Z"),
    ...(deletedAt ? { deletedAt: new Date(deletedAt) } : {}),
  };
}

test("每日健康返回有效成员和选中日期适用的周期规则", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const secondMember = {
    _id: "user-2",
    displayName: "用户二",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller, secondMember],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
      {
        familyId: "family-1",
        userId: secondMember._id,
        status: "active",
      },
    ],
    recurringRules: [
      createRecurringRule({
        id: "friday-rule",
        subjectUserId: "user-2",
        repeat: {
          type: "weekly",
          weekdays: [5],
        },
      }),
      createRecurringRule({
        id: "saturday-rule",
        repeat: {
          type: "weekly",
          weekdays: [6],
        },
      }),
      createRecurringRule({
        id: "deleted-rule",
        deletedAt: "2026-07-30T01:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
    now: () => new Date("2026-07-30T02:00:00.000Z"),
  });

  const result = await api.handle({
    action: "getDailyHealth",
    data: {
      familyId: "family-1",
      date: "2026-07-31",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.members, [
    {
      id: "user-1",
      displayName: "用户一",
      avatarUrl: null,
    },
    {
      id: "user-2",
      displayName: "用户二",
      avatarUrl: null,
    },
  ]);
  assert.deepEqual(
    result.data.recurringRules.map((rule) => ({
      id: rule.id,
      subjectName: rule.subject.displayName,
      repeat: rule.repeat,
      datePhase: rule.datePhase,
    })),
    [
      {
        id: "friday-rule",
        subjectName: "用户二",
        repeat: {
          type: "weekly",
          weekdays: [5],
        },
        datePhase: "未开始",
      },
    ],
  );
});

test("每日健康按中国标准时间返回当天记录和提醒并计算提醒标签", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "today-record",
        occurredAt: "2026-07-29T01:30:00.000Z",
      }),
      createRecord({
        id: "tomorrow-record",
        occurredAt: "2026-07-29T16:30:00.000Z",
      }),
    ],
    reminders: [
      createReminder({
        id: "due-reminder",
        plannedAt: "2026-07-29T01:00:00.000Z",
      }),
      createReminder({
        id: "future-reminder",
        plannedAt: "2026-07-29T03:00:00.000Z",
        notificationTimes: [
          "2026-07-29T02:30:00.000Z",
          "2026-07-29T02:45:00.000Z",
        ],
      }),
      createReminder({
        id: "tomorrow-reminder",
        plannedAt: "2026-07-29T16:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
    now: () => new Date("2026-07-29T02:00:00.000Z"),
  });

  const result = await api.handle({
    action: "getDailyHealth",
    requestId: "req-daily-health",
    data: {
      familyId: "family-1",
      date: "2026-07-29",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.date, "2026-07-29");
  assert.deepEqual(
    result.data.records.map((record) => record.id),
    ["today-record"],
  );
  assert.deepEqual(
    result.data.reminders.map((reminder) => ({
      id: reminder.id,
      displayStatus: reminder.displayStatus,
    })),
    [
      {
        id: "due-reminder",
        displayStatus: "待打卡",
      },
      {
        id: "future-reminder",
        displayStatus: "待开始",
      },
    ],
  );
  assert.deepEqual(result.data.reminders[1].notificationTimes, [
    "2026-07-29T02:30:00.000Z",
    "2026-07-29T02:45:00.000Z",
  ]);
});

test("数据所属人已离开家庭时待打卡提醒派生为已暂停", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const inactiveSubject = {
    _id: "user-2",
    displayName: "已退出成员",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller, inactiveSubject],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
      {
        familyId: "family-1",
        userId: inactiveSubject._id,
        status: "inactive",
      },
    ],
    reminders: [
      createReminder({
        id: "inactive-subject-reminder",
        subjectUserId: inactiveSubject._id,
        plannedAt: "2026-07-29T01:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
    now: () => new Date("2026-07-29T02:00:00.000Z"),
  });

  const result = await api.handle({
    action: "getDailyHealth",
    data: {
      familyId: "family-1",
      date: "2026-07-29",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.reminders[0].displayStatus, "已暂停");
  assert.equal(result.data.reminders[0].subjectIsActive, false);
});

test("时间线只返回当前家庭未删除记录，并按发生时间倒序排列", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "older",
        occurredAt: "2026-07-29T01:00:00.000Z",
      }),
      createRecord({
        id: "newer",
        occurredAt: "2026-07-29T02:00:00.000Z",
        remark: "饭后",
      }),
      createRecord({
        id: "deleted",
        occurredAt: "2026-07-29T03:00:00.000Z",
        deletedAt: "2026-07-29T03:05:00.000Z",
      }),
      createRecord({
        id: "another-family",
        familyId: "family-2",
        occurredAt: "2026-07-29T04:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
  });

  const result = await api.handle({
    action: "getRecordTimeline",
    requestId: "req-record-timeline",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.items.map((item) => ({
      id: item.id,
      subjectName: item.subject.displayName,
      occurredAt: item.occurredAt,
      remark: item.remark,
    })),
    [
      {
        id: "newer",
        subjectName: "用户一",
        occurredAt: "2026-07-29T02:00:00.000Z",
        remark: "饭后",
      },
      {
        id: "older",
        subjectName: "用户一",
        occurredAt: "2026-07-29T01:00:00.000Z",
        remark: undefined,
      },
    ],
  );
});

test("已删除记录列表只返回当前家庭的软删除记录", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "active",
        occurredAt: "2026-07-29T01:00:00.000Z",
      }),
      createRecord({
        id: "deleted-older",
        occurredAt: "2026-07-29T02:00:00.000Z",
        deletedAt: "2026-07-29T03:00:00.000Z",
      }),
      createRecord({
        id: "deleted-newer",
        occurredAt: "2026-07-29T01:30:00.000Z",
        deletedAt: "2026-07-29T04:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
  });

  const result = await api.handle({
    action: "getDeletedRecordTimeline",
    requestId: "req-deleted-record-timeline",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.items.map((item) => ({
      id: item.id,
      deletedAt: item.deletedAt,
      revision: item.revision,
    })),
    [
      {
        id: "deleted-newer",
        deletedAt: "2026-07-29T04:00:00.000Z",
        revision: 1,
      },
      {
        id: "deleted-older",
        deletedAt: "2026-07-29T03:00:00.000Z",
        revision: 1,
      },
    ],
  );
});

test("健康记录看板一次返回五类卡片需要的家庭数据", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const familyMember = {
    _id: "user-2",
    displayName: "用户二",
  };
  const deletedReminder = createReminder({
    id: "deleted-reminder",
    plannedAt: "2026-07-28T01:00:00.000Z",
  });
  deletedReminder.deletedAt = new Date(
    "2026-07-28T02:00:00.000Z",
  );
  const queryStore = createInMemoryQueryStore({
    users: [caller, familyMember],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
      {
        familyId: "family-1",
        userId: familyMember._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "dashboard-record",
        subjectUserId: familyMember._id,
        occurredAt: "2026-07-29T01:00:00.000Z",
      }),
      createRecord({
        id: "deleted-record",
        occurredAt: "2026-07-29T02:00:00.000Z",
        deletedAt: "2026-07-29T03:00:00.000Z",
      }),
    ],
    reminders: [
      createReminder({
        id: "completed-reminder",
        subjectUserId: familyMember._id,
        plannedAt: "2026-07-29T01:30:00.000Z",
        status: "completed",
      }),
      createReminder({
        id: "pending-reminder",
        plannedAt: "2026-07-30T01:30:00.000Z",
      }),
      deletedReminder,
    ],
    recurringRules: [
      createRecurringRule({ id: "active-rule" }),
      createRecurringRule({
        id: "deleted-rule",
        deletedAt: "2026-07-30T01:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
    now: () => new Date("2026-07-30T02:00:00.000Z"),
  });

  const result = await api.handle({
    action: "getDashboardData",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.members.map((member) => member.id),
    ["user-1", "user-2"],
  );
  assert.deepEqual(
    result.data.records.map((record) => record.id),
    ["dashboard-record"],
  );
  assert.deepEqual(
    result.data.reminders.map((reminder) => reminder.id),
    ["pending-reminder", "completed-reminder"],
  );
  assert.deepEqual(
    result.data.recurringRules.map((rule) => rule.id),
    ["active-rule"],
  );
  assert.equal(
    result.data.records[0].subject.displayName,
    "用户二",
  );
});

test("进阶分析只返回三种系统模板的白名单数据", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const familyMember = {
    _id: "user-2",
    displayName: "用户二",
  };
  const bloodPressure = createRecord({
    id: "blood-pressure",
    subjectUserId: familyMember._id,
    occurredAt: "2026-07-31T01:00:00.000Z",
  });
  Object.assign(bloodPressure, {
    sourceTemplateId: "sys_blood_pressure",
    templateNameSnapshot: "血压",
    fieldSchemaSnapshot: [
      { key: "systolic", label: "收缩压", type: "number", unit: "mmHg" },
      { key: "diastolic", label: "舒张压", type: "number", unit: "mmHg" },
      { key: "privateField", label: "内部字段", type: "short_text" },
    ],
    values: {
      systolic: 128,
      diastolic: 82,
      privateField: "不可导出",
    },
  });
  const customCopy = structuredClone(bloodPressure);
  customCopy._id = "custom-copy";
  customCopy.sourceTemplateType = "custom";
  customCopy.sourceTemplateId = "custom-blood-pressure";
  const medicationReminder = createReminder({
    id: "medication-reminder",
    subjectUserId: familyMember._id,
    plannedAt: "2026-07-31T02:00:00.000Z",
    status: "completed",
  });
  Object.assign(medicationReminder, {
    sourceTemplateId: "sys_medication",
    templateNameSnapshot: "用药",
    fieldSchemaSnapshot: [
      { key: "medicineName", label: "药品名称", type: "short_text" },
      { key: "dosage", label: "用量", type: "short_text" },
    ],
    values: {
      medicineName: "示例药物",
      dosage: "1 片",
      privateField: "不可导出",
    },
    completedAt: new Date("2026-07-31T02:05:00.000Z"),
    linkedRecordId: "medication-record",
  });
  const unrelatedReminder = createReminder({
    id: "temperature-reminder",
    plannedAt: "2026-07-31T03:00:00.000Z",
  });
  const queryStore = createInMemoryQueryStore({
    users: [caller, familyMember],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
      {
        familyId: "family-1",
        userId: familyMember._id,
        status: "active",
      },
    ],
    records: [
      bloodPressure,
      customCopy,
      createRecord({
        id: "temperature",
        occurredAt: "2026-07-31T04:00:00.000Z",
      }),
    ],
    reminders: [medicationReminder, unrelatedReminder],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
  });

  const result = await api.handle({
    action: "getAnalysisData",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.members, [
    {
      id: "user-1",
      displayName: "用户一",
      avatarUrl: null,
      isSelf: true,
      isActive: true,
    },
    {
      id: "user-2",
      displayName: "用户二",
      avatarUrl: null,
      isSelf: false,
      isActive: true,
    },
  ]);
  assert.deepEqual(result.data.records, [
    {
      id: "blood-pressure",
      analysisType: "blood_pressure",
      subject: {
        id: "user-2",
        displayName: "用户二",
      },
      sourceTemplateId: "sys_blood_pressure",
      values: {
        systolic: 128,
        diastolic: 82,
      },
      occurredAt: "2026-07-31T01:00:00.000Z",
    },
  ]);
  assert.deepEqual(result.data.medicationReminders, [
    {
      id: "medication-reminder",
      subject: {
        id: "user-2",
        displayName: "用户二",
      },
      values: {
        medicineName: "示例药物",
        dosage: "1 片",
      },
      plannedAt: "2026-07-31T02:00:00.000Z",
      status: "completed",
      completedAt: "2026-07-31T02:05:00.000Z",
      linkedRecordId: "medication-record",
    },
  ]);
});
