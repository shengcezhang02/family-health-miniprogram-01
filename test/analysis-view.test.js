const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnalysisView,
} = require("../miniprogram/services/analysis-view");

function record({
  id,
  analysisType,
  memberId = "user-1",
  occurredAt,
  values,
}) {
  return {
    id,
    analysisType,
    subject: {
      id: memberId,
      displayName: memberId,
    },
    values,
    occurredAt,
  };
}

test("血压分析按成员和时间范围计算收缩压与舒张压统计", () => {
  const view = buildAnalysisView({
    type: "blood_pressure",
    analysisData: {
      records: [
        record({
          id: "older",
          analysisType: "blood_pressure",
          occurredAt: "2026-07-20T01:00:00.000Z",
          values: { systolic: 120, diastolic: 80 },
        }),
        record({
          id: "newer",
          analysisType: "blood_pressure",
          occurredAt: "2026-07-31T01:00:00.000Z",
          values: { systolic: 140, diastolic: 90 },
        }),
        record({
          id: "other-member",
          analysisType: "blood_pressure",
          memberId: "user-2",
          occurredAt: "2026-07-31T02:00:00.000Z",
          values: { systolic: 160, diastolic: 100 },
        }),
        record({
          id: "too-old",
          analysisType: "blood_pressure",
          occurredAt: "2026-06-01T01:00:00.000Z",
          values: { systolic: 100, diastolic: 60 },
        }),
      ],
      medicationReminders: [],
    },
    filters: {
      memberIds: ["user-1"],
      timeRange: "30d",
    },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.equal(view.count, 2);
  assert.deepEqual(view.metrics, {
    systolic: {
      label: "收缩压",
      average: 130,
      minimum: 120,
      maximum: 140,
      unit: "mmHg",
    },
    diastolic: {
      label: "舒张压",
      average: 85,
      minimum: 80,
      maximum: 90,
      unit: "mmHg",
    },
  });
  assert.deepEqual(
    view.records.map((item) => item.id),
    ["older", "newer"],
  );
  assert.deepEqual(
    view.series.map((series) => ({
      key: series.key,
      values: series.points.map((point) => point.value),
    })),
    [
      { key: "systolic", values: [120, 140] },
      { key: "diastolic", values: [80, 90] },
    ],
  );
});

test("血糖分析按测量场景分组并比较相邻时间范围", () => {
  const view = buildAnalysisView({
    type: "blood_glucose",
    analysisData: {
      records: [
        record({
          id: "fasting-1",
          analysisType: "blood_glucose",
          occurredAt: "2026-07-20T01:00:00.000Z",
          values: { glucose: 5, measurementScene: "fasting" },
        }),
        record({
          id: "fasting-2",
          analysisType: "blood_glucose",
          occurredAt: "2026-07-25T01:00:00.000Z",
          values: { glucose: 6, measurementScene: "fasting" },
        }),
        record({
          id: "after-meal",
          analysisType: "blood_glucose",
          occurredAt: "2026-07-31T01:00:00.000Z",
          values: {
            glucose: 7.5,
            measurementScene: "after_meal_2h",
          },
        }),
        record({
          id: "previous-period",
          analysisType: "blood_glucose",
          occurredAt: "2026-06-20T01:00:00.000Z",
          values: { glucose: 6, measurementScene: "fasting" },
        }),
      ],
      medicationReminders: [],
    },
    filters: {
      memberIds: ["user-1"],
      timeRange: "30d",
      measurementScene: "all",
    },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.equal(view.count, 3);
  assert.deepEqual(view.metrics.glucose, {
    label: "血糖",
    average: 6.2,
    minimum: 5,
    maximum: 7.5,
    unit: "mmol/L",
  });
  assert.deepEqual(view.sceneGroups, [
    {
      key: "fasting",
      label: "空腹",
      count: 2,
      average: 5.5,
      reference: "3.9–6.1 mmol/L",
    },
    {
      key: "after_meal_2h",
      label: "餐后 2 小时",
      count: 1,
      average: 7.5,
      reference: "<7.8 mmol/L",
    },
  ]);
  assert.deepEqual(view.comparison, {
    currentAverage: 6.2,
    previousAverage: 6,
    change: 0.2,
    label: "较前 30 天",
  });
});

test("用药完成分析只统计已到计划时间的提醒并保留用药历史", () => {
  const view = buildAnalysisView({
    type: "medication",
    analysisData: {
      records: [
        record({
          id: "medication-history",
          analysisType: "medication",
          occurredAt: "2026-07-31T01:05:00.000Z",
          values: { medicineName: "示例药物", dosage: "1 片" },
        }),
      ],
      medicationReminders: [
        {
          id: "completed",
          subject: { id: "user-1", displayName: "user-1" },
          values: { medicineName: "示例药物", dosage: "1 片" },
          plannedAt: "2026-07-31T01:00:00.000Z",
          status: "completed",
        },
        {
          id: "incomplete",
          subject: { id: "user-1", displayName: "user-1" },
          values: { medicineName: "示例药物", dosage: "1 片" },
          plannedAt: "2026-08-01T01:00:00.000Z",
          status: "pending",
        },
        {
          id: "future",
          subject: { id: "user-1", displayName: "user-1" },
          values: { medicineName: "示例药物", dosage: "1 片" },
          plannedAt: "2026-08-03T01:00:00.000Z",
          status: "pending",
        },
      ],
    },
    filters: {
      memberIds: ["user-1"],
      timeRange: "30d",
    },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.deepEqual(view.summary, {
    planned: 2,
    completed: 1,
    rate: 50,
  });
  assert.deepEqual(
    view.incompleteReminders.map((item) => item.id),
    ["incomplete"],
  );
  assert.deepEqual(
    view.history.map((item) => item.id),
    ["medication-history"],
  );
});
