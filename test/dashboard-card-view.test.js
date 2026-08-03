const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDashboardCardViews,
  buildDashboardFilterControls,
} = require("../miniprogram/services/dashboard-card-view");

test("卡片筛选按钮直接标明当前成员和时间范围", () => {
  assert.deepEqual(
    buildDashboardFilterControls(
      {
        memberIds: ["user-1"],
        timeRange: "30d",
      },
      [{ id: "user-1", displayLabel: "妈妈（我）" }],
    ),
    {
      memberLabel: "成员：妈妈（我）",
      rangeLabel: "范围：近30天",
    },
  );
});

function createRecord({
  id,
  subjectUserId,
  templateId = "sys_temperature",
  occurredAt,
  value = 36.5,
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId: templateId,
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        sortOrder: 10,
      },
    ],
    values: {
      temperature: value,
    },
    occurredAt,
  };
}

function createReminder({
  id,
  subjectUserId = "user-1",
  templateId = "sys_temperature",
  plannedAt,
  status = "pending",
  displayStatus = "未打卡",
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId: templateId,
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [],
    values: {},
    plannedAt,
    status,
    displayStatus,
  };
}

function createRule({
  id,
  subjectUserId = "user-1",
  templateId = "sys_temperature",
  repeat = { type: "daily" },
  status = "active",
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId: templateId,
    templateNameSnapshot: "体温",
    startDate: "2026-07-01",
    endDate: "2026-08-31",
    repeat,
    dailyTimes: ["08:00", "20:00"],
    status,
    datePhase: "进行中",
  };
}

test("记录列表卡片按成员、健康项目和时间范围筛选记录", () => {
  const views = buildDashboardCardViews({
    cards: [
      {
        id: "card-1",
        type: "record_list",
        title: "家人的近期体温",
        memberIds: ["user-2"],
        templateId: "sys_temperature",
        timeRange: "7d",
        fieldKeys: ["temperature"],
      },
    ],
    dashboardData: {
      records: [
        createRecord({
          id: "matching",
          subjectUserId: "user-2",
          occurredAt: "2026-07-30T01:00:00.000Z",
        }),
        createRecord({
          id: "wrong-member",
          subjectUserId: "user-1",
          occurredAt: "2026-07-31T01:00:00.000Z",
        }),
        createRecord({
          id: "too-old",
          subjectUserId: "user-2",
          occurredAt: "2026-07-20T01:00:00.000Z",
        }),
      ],
      reminders: [],
      recurringRules: [],
    },
    members: [
      { id: "user-1", displayLabel: "用户一（我）" },
      { id: "user-2", displayLabel: "用户二（家人 1）" },
    ],
    now: new Date("2026-08-01T02:00:00.000Z"),
  });

  assert.equal(views[0].typeLabel, "记录列表");
  assert.equal(views[0].filterLabel, "用户二（家人 1） · 近7天");
  assert.deepEqual(
    views[0].items.map((item) => item.id),
    ["matching"],
  );
});

test("最新数据卡片展示每名成员的最新值及相对上一次的变化", () => {
  const views = buildDashboardCardViews({
    cards: [
      {
        id: "card-latest",
        type: "latest_data",
        title: "最新体温",
        memberIds: ["user-1"],
        templateId: "sys_temperature",
        timeRange: "30d",
        fieldKeys: ["temperature"],
      },
    ],
    dashboardData: {
      records: [
        createRecord({
          id: "previous",
          subjectUserId: "user-1",
          occurredAt: "2026-07-29T01:00:00.000Z",
          value: 36.5,
        }),
        createRecord({
          id: "latest",
          subjectUserId: "user-1",
          occurredAt: "2026-07-31T01:00:00.000Z",
          value: 37,
        }),
      ],
      reminders: [],
      recurringRules: [],
    },
    members: [
      { id: "user-1", displayLabel: "用户一（我）" },
    ],
    now: new Date("2026-08-01T02:00:00.000Z"),
  });

  assert.equal(views[0].items[0].record.id, "latest");
  assert.equal(views[0].items[0].memberLabel, "用户一（我）");
  assert.deepEqual(views[0].items[0].values, [
    {
      key: "temperature",
      label: "体温",
      value: 37,
      unit: "℃",
      change: 0.5,
    },
  ]);
});

test("趋势卡片按成员和数值字段生成从旧到新的数据序列", () => {
  const views = buildDashboardCardViews({
    cards: [
      {
        id: "card-trend",
        type: "trend",
        title: "体温趋势",
        memberIds: ["user-1"],
        templateId: "sys_temperature",
        timeRange: "30d",
        fieldKeys: ["temperature"],
      },
    ],
    dashboardData: {
      records: [
        createRecord({
          id: "newer",
          subjectUserId: "user-1",
          occurredAt: "2026-07-31T01:00:00.000Z",
          value: 37,
        }),
        createRecord({
          id: "older",
          subjectUserId: "user-1",
          occurredAt: "2026-07-29T01:00:00.000Z",
          value: 36.5,
        }),
      ],
      reminders: [],
      recurringRules: [],
    },
    members: [
      { id: "user-1", displayLabel: "用户一（我）" },
    ],
    now: new Date("2026-08-01T02:00:00.000Z"),
  });

  assert.deepEqual(views[0].series, [
    {
      key: "user-1:temperature",
      label: "用户一（我） · 体温",
      unit: "℃",
      points: [
        {
          recordId: "older",
          occurredAt: "2026-07-29T01:00:00.000Z",
          value: 36.5,
        },
        {
          recordId: "newer",
          occurredAt: "2026-07-31T01:00:00.000Z",
          value: 37,
        },
      ],
    },
  ]);
});

test("提醒完成卡片只统计已经到期的提醒并列出未完成项", () => {
  const views = buildDashboardCardViews({
    cards: [
      {
        id: "card-reminders",
        type: "reminder_completion",
        title: "本周打卡",
        memberIds: ["user-1"],
        templateId: "sys_temperature",
        timeRange: "7d",
        fieldKeys: [],
      },
    ],
    dashboardData: {
      records: [],
      reminders: [
        createReminder({
          id: "completed",
          plannedAt: "2026-07-30T01:00:00.000Z",
          status: "completed",
          displayStatus: "已打卡",
        }),
        createReminder({
          id: "missed",
          plannedAt: "2026-07-29T01:00:00.000Z",
        }),
        createReminder({
          id: "future",
          plannedAt: "2026-08-02T01:00:00.000Z",
          displayStatus: "待开始",
        }),
      ],
      recurringRules: [],
    },
    members: [
      { id: "user-1", displayLabel: "用户一（我）" },
    ],
    now: new Date("2026-08-01T02:00:00.000Z"),
  });

  assert.deepEqual(views[0].summary, {
    expected: 2,
    completed: 1,
    rate: 50,
  });
  assert.deepEqual(
    views[0].items.map((item) => item.id),
    ["missed"],
  );
});

test("周期提醒卡片按成员和健康项目筛选规则并整理周期文字", () => {
  const views = buildDashboardCardViews({
    cards: [
      {
        id: "card-rules",
        type: "recurring_rules",
        title: "家人的周期计划",
        memberIds: ["user-2"],
        templateId: "sys_temperature",
        timeRange: "all",
        fieldKeys: [],
      },
    ],
    dashboardData: {
      records: [],
      reminders: [],
      recurringRules: [
        createRule({
          id: "matching",
          subjectUserId: "user-2",
        }),
        createRule({
          id: "wrong-member",
          subjectUserId: "user-1",
        }),
      ],
    },
    members: [
      { id: "user-1", displayLabel: "用户一（我）" },
      { id: "user-2", displayLabel: "用户二（家人 1）" },
    ],
    now: new Date("2026-08-01T02:00:00.000Z"),
  });

  assert.deepEqual(
    views[0].items.map((item) => ({
      id: item.id,
      memberLabel: item.memberLabel,
      scheduleLabel: item.scheduleLabel,
      statusLabel: item.statusLabel,
    })),
    [
      {
        id: "matching",
        memberLabel: "用户二（家人 1）",
        scheduleLabel: "每天 · 08:00、20:00",
        statusLabel: "进行中",
      },
    ],
  );
});
