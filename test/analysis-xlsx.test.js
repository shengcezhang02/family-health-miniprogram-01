const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnalysisXlsx,
} = require("../miniprogram/services/analysis-xlsx");

test("分析数据可以生成微信文档组件支持的真实 XLSX 文件", () => {
  const workbook = buildAnalysisXlsx({
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
      ],
      medicationReminders: [],
    },
    filters: { memberIds: [], timeRange: "30d" },
    now: new Date("2026-08-02T00:00:00.000Z"),
  });
  const bytes = new Uint8Array(workbook);
  const raw = new TextDecoder().decode(bytes);

  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(raw, /xl\/workbook\.xml/);
  assert.match(raw, /xl\/worksheets\/sheet1\.xml/);
  assert.match(raw, /血压记录/);
  assert.match(raw, /128/);
  assert.doesNotMatch(raw, /不得导出|record-1/);
});
