const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnalysisCsv,
} = require("../miniprogram/services/analysis-export");

test("CSV 只导出当前筛选范围内允许公开的分析字段", () => {
  const csv = buildAnalysisCsv({
    type: "blood_pressure",
    analysisData: {
      records: [
        {
          id: "record-1",
          analysisType: "blood_pressure",
          subject: { id: "user-1", displayName: "小明" },
          occurredAt: "2026-08-01T08:00:00.000Z",
          values: { systolic: 128, diastolic: 82 },
          privateAudit: "不得导出",
        },
        {
          id: "record-2",
          analysisType: "blood_pressure",
          subject: { id: "user-2", displayName: "小红" },
          occurredAt: "2026-08-01T09:00:00.000Z",
          values: { systolic: 118, diastolic: 76 },
        },
      ],
      medicationReminders: [],
    },
    filters: { memberIds: ["user-1"], timeRange: "30d" },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.match(csv, /^\uFEFF类型,成员,时间,收缩压\(mmHg\),舒张压\(mmHg\)/);
  assert.match(csv, /血压记录,小明,/);
  assert.match(csv, /,128,82/);
  assert.doesNotMatch(csv, /小红|不得导出|record-1/);
});

test("用药导出同时包含到期提醒和实际用药记录", () => {
  const csv = buildAnalysisCsv({
    type: "medication",
    analysisData: {
      records: [
        {
          id: "history-1",
          analysisType: "medication",
          subject: { id: "user-1", displayName: "小明" },
          occurredAt: "2026-08-01T08:05:00.000Z",
          values: { medicineName: "示例药", dosage: "1 片" },
        },
      ],
      medicationReminders: [
        {
          id: "reminder-1",
          subject: { id: "user-1", displayName: "小明" },
          plannedAt: "2026-08-01T08:00:00.000Z",
          status: "completed",
          values: { medicineName: "示例药", dosage: "1 片" },
        },
      ],
    },
    filters: { memberIds: [], timeRange: "30d" },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });

  assert.match(csv, /用药提醒,小明,.*示例药,1 片,已完成/);
  assert.match(csv, /用药记录,小明,.*示例药,1 片,已记录/);
});
