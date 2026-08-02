const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildTrendChart,
  buildTrendPlot,
  getHealthReferenceLines,
} = require("../miniprogram/services/trend-chart");

test("趋势图为相邻数据点生成连续折线段", () => {
  const plot = buildTrendPlot([
    { recordId: "first", value: 36 },
    { recordId: "second", value: 38 },
    { recordId: "third", value: 37 },
  ]);

  assert.deepEqual(
    plot.map((point) => ({
      recordId: point.recordId,
      position: point.position,
      linePolygon: point.linePolygon,
    })),
    [
      {
        recordId: "first",
        position: 10,
        linePolygon: "0% 89%, 0% 91%, 100% 11%, 100% 9%",
      },
      {
        recordId: "second",
        position: 90,
        linePolygon: "0% 9%, 0% 11%, 100% 51%, 100% 49%",
      },
      {
        recordId: "third",
        position: 50,
        linePolygon: "",
      },
    ],
  );
});

test("趋势图同时生成纵轴数值、横轴范围和参考值位置", () => {
  const chart = buildTrendChart(
    [
      {
        recordId: "first",
        occurredAt: "2026-08-01T08:00:00.000Z",
        value: 120,
      },
      {
        recordId: "second",
        occurredAt: "2026-08-02T08:00:00.000Z",
        value: 130,
      },
    ],
    [{ value: 140, label: "参考 140" }],
  );

  assert.deepEqual(
    chart.yAxis.map((tick) => tick.value),
    [140, 130, 120],
  );
  assert.deepEqual(chart.xAxis, {
    start: "2026-08-01T08:00:00.000Z",
    end: "2026-08-02T08:00:00.000Z",
  });
  assert.equal(chart.references[0].position, 90);
  assert.equal(chart.points[0].position, 10);
});

test("系统血压和血糖项目提供图内参考值，自定义项目不臆造参考值", () => {
  assert.deepEqual(
    getHealthReferenceLines("sys_blood_pressure", "systolic"),
    [{ value: 140, label: "参考 140" }],
  );
  assert.deepEqual(
    getHealthReferenceLines("sys_blood_glucose", "glucose"),
    [
      { value: 3.9, label: "空腹下限 3.9" },
      { value: 6.1, label: "空腹上限 6.1" },
      { value: 7.8, label: "餐后 2h 7.8" },
    ],
  );
  assert.deepEqual(
    getHealthReferenceLines("custom_template", "value"),
    [],
  );
});
