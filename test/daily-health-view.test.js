const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDailyHealthView,
  normalizeDailyDisplayMode,
} = require("../miniprogram/services/daily-health-view");

function createRecord({
  id,
  subjectUserId = "user-1",
  sourceTemplateId = "sys_temperature",
  occurredAt,
  sourceReminderId,
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId,
    templateNameSnapshot: sourceTemplateId,
    occurredAt,
    ...(sourceReminderId ? { sourceReminderId } : {}),
  };
}

function createReminder({
  id,
  subjectUserId = "user-1",
  sourceTemplateId = "sys_temperature",
  plannedAt,
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId,
    templateNameSnapshot: sourceTemplateId,
    plannedAt,
  };
}

function createRule({
  id,
  subjectUserId = "user-1",
  sourceTemplateId = "sys_temperature",
}) {
  return {
    id,
    subject: {
      id: subjectUserId,
      displayName: subjectUserId,
    },
    sourceTemplateId,
    templateNameSnapshot: sourceTemplateId,
  };
}

test("每日健康筛选在本地同时作用于记录、提醒和周期规则", () => {
  const view = buildDailyHealthView({
    records: [
      createRecord({
        id: "record-kept",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-07-31T01:00:00.000Z",
      }),
      createRecord({
        id: "record-other-member",
        subjectUserId: "user-1",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-07-31T02:00:00.000Z",
      }),
    ],
    reminders: [
      createReminder({
        id: "reminder-kept",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        plannedAt: "2026-07-31T03:00:00.000Z",
      }),
      createReminder({
        id: "reminder-other-template",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_blood_pressure",
        plannedAt: "2026-07-31T04:00:00.000Z",
      }),
    ],
    recurringRules: [
      createRule({
        id: "rule-kept",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
      }),
    ],
    filters: {
      memberId: "user-2",
      templateId: "sys_temperature",
      itemType: "all",
    },
  });

  assert.deepEqual(
    view.records.map((record) => record.id),
    ["record-kept"],
  );
  assert.deepEqual(
    view.reminders.map((reminder) => reminder.id),
    ["reminder-kept"],
  );
  assert.deepEqual(
    view.recurringRules.map((rule) => rule.id),
    ["rule-kept"],
  );
});

test("混排时打卡记录嵌在来源提醒下，其他记录按时间排列", () => {
  const view = buildDailyHealthView({
    records: [
      createRecord({
        id: "check-in-record",
        occurredAt: "2026-07-31T01:10:00.000Z",
        sourceReminderId: "reminder-1",
      }),
      createRecord({
        id: "independent-record",
        occurredAt: "2026-07-31T02:00:00.000Z",
      }),
    ],
    reminders: [
      createReminder({
        id: "reminder-1",
        plannedAt: "2026-07-31T01:00:00.000Z",
      }),
    ],
    recurringRules: [],
    filters: {
      memberId: "all",
      templateId: "all",
      itemType: "all",
    },
  });

  assert.deepEqual(
    view.timelineItems.map((item) => ({
      kind: item.kind,
      id: item.id,
      linkedRecordIds: item.linkedRecords.map((record) => record.id),
    })),
    [
      {
        kind: "reminder",
        id: "reminder-1",
        linkedRecordIds: ["check-in-record"],
      },
      {
        kind: "record",
        id: "independent-record",
        linkedRecordIds: [],
      },
    ],
  );
});

test("后来补打卡的记录只嵌入原提醒，不冒充所选日期的普通记录", () => {
  const view = buildDailyHealthView({
    records: [],
    linkedRecords: [
      createRecord({
        id: "later-check-in",
        occurredAt: "2026-08-05T02:04:00.000Z",
        sourceReminderId: "august-2-reminder",
      }),
    ],
    reminders: [
      createReminder({
        id: "august-2-reminder",
        plannedAt: "2026-08-02T00:00:00.000Z",
      }),
    ],
    recurringRules: [],
  });

  assert.deepEqual(view.records, []);
  assert.deepEqual(
    view.timelineItems[0].linkedRecords.map((record) => record.id),
    ["later-check-in"],
  );
  assert.deepEqual(
    view.reminders[0].linkedRecords.map((record) => record.id),
    ["later-check-in"],
  );
});

test("来源提醒被周期调整清理后，已打卡记录仍作为普通记录显示", () => {
  const view = buildDailyHealthView({
    records: [
      createRecord({
        id: "kept-check-in-record",
        occurredAt: "2026-08-01T01:10:00.000Z",
        sourceReminderId: "removed-future-reminder",
      }),
    ],
    reminders: [],
    recurringRules: [],
  });

  assert.deepEqual(
    view.timelineItems.map((item) => ({
      kind: item.kind,
      id: item.id,
    })),
    [
      {
        kind: "record",
        id: "kept-check-in-record",
      },
    ],
  );
});

test("每日健康只接受 mixed 或 grouped 两种本地展示偏好", () => {
  assert.equal(normalizeDailyDisplayMode("mixed"), "mixed");
  assert.equal(normalizeDailyDisplayMode("grouped"), "grouped");
  assert.equal(normalizeDailyDisplayMode("unknown"), "mixed");
});
