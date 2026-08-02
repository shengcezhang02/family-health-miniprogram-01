const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnalysisChartSeries,
} = require("../miniprogram/services/analysis-chart");

test("血压趋势图把纵轴、横轴和对应参考值放进同一比例尺", () => {
  const charts = buildAnalysisChartSeries({
    type: "blood_pressure",
    reference: {
      value: "收缩压 ≥140 或舒张压 ≥90 mmHg",
    },
    series: [
      {
        key: "systolic",
        label: "收缩压",
        unit: "mmHg",
        points: [
          { occurredAt: "2026-08-01T08:00:00.000Z", value: 120 },
          { occurredAt: "2026-08-02T08:00:00.000Z", value: 130 },
        ],
      },
    ],
  });

  assert.equal(charts[0].references[0].value, 140);
  assert.equal(charts[0].references[0].label, "参考 140");
  assert.deepEqual(charts[0].yAxis.map((tick) => tick.value), [
    140,
    130,
    120,
  ]);
  assert.equal(charts[0].xAxis.start, "2026-08-01T08:00:00.000Z");
  assert.equal(charts[0].xAxis.end, "2026-08-02T08:00:00.000Z");
  assert.ok(charts[0].references[0].position > 0);
  assert.ok(charts[0].points[0].position < charts[0].points[1].position);
});
