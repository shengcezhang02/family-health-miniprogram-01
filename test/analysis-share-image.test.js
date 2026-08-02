const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAnalysisShareImage,
  buildShareChartGeometry,
  waitForCanvasDraw,
} = require("../miniprogram/services/analysis-share-image");

test("分析长图只包含当前分析的筛选说明、汇总和医疗提示", () => {
  const model = buildAnalysisShareImage({
    familyName: "我的家庭",
    memberLabel: "小明（我）",
    timeRangeLabel: "近 30 天",
    view: {
      type: "blood_pressure",
      title: "血压分析",
      count: 2,
      metrics: {
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
      },
      series: [{ key: "systolic", label: "收缩压", points: [] }],
      reference: {
        label: "高血压参考阈值",
        value: "收缩压 ≥140 或舒张压 ≥90 mmHg",
        note: "请以医生建议为准。",
      },
    },
  });

  assert.equal(model.title, "血压分析");
  assert.equal(model.filterLine, "我的家庭 · 小明（我） · 近 30 天");
  assert.deepEqual(model.summaryLines, [
    "共 2 条数据",
    "收缩压 平均 130 mmHg · 最低 120 · 最高 140",
    "舒张压 平均 85 mmHg · 最低 80 · 最高 90",
  ]);
  assert.match(model.noticeLines.join(" "), /不构成医疗诊断/);
});

test("血压长图保留收缩压和舒张压两条曲线及每个点的数值标签", () => {
  const model = buildAnalysisShareImage({
    familyName: "我的家庭",
    memberLabel: "全部成员",
    timeRangeLabel: "近 7 天",
    view: {
      type: "blood_pressure",
      title: "血压分析",
      count: 2,
      metrics: {},
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
        {
          key: "diastolic",
          label: "舒张压",
          unit: "mmHg",
          points: [
            { occurredAt: "2026-08-01T08:00:00.000Z", value: 80 },
            { occurredAt: "2026-08-02T08:00:00.000Z", value: 85 },
          ],
        },
      ],
    },
  });

  assert.deepEqual(
    model.chartSeries.map((series) => ({
      label: series.label,
      pointLabels: series.points.map((point) => point.valueLabel),
    })),
    [
      { label: "收缩压", pointLabels: ["120", "130"] },
      { label: "舒张压", pointLabels: ["80", "85"] },
    ],
  );
  assert.deepEqual(
    model.chartSeries.map((series) =>
      series.references.map((reference) => reference.value),
    ),
    [[140], [90]],
  );
});

test("长图绘图坐标包含两条血压序列而非只取第一条", () => {
  const geometry = buildShareChartGeometry(
    [
      {
        label: "收缩压",
        color: "green",
        points: [
          { value: 120, valueLabel: "120" },
          { value: 130, valueLabel: "130" },
        ],
      },
      {
        label: "舒张压",
        color: "red",
        points: [
          { value: 80, valueLabel: "80" },
          { value: 85, valueLabel: "85" },
        ],
      },
    ],
    { width: 500, height: 200 },
  );

  assert.equal(geometry.series.length, 2);
  assert.deepEqual(
    geometry.series.map((series) =>
      series.points.map((point) => point.valueLabel),
    ),
    [
      ["120", "130"],
      ["80", "85"],
    ],
  );
  assert.ok(
    geometry.series[0].points[0].y <
      geometry.series[1].points[0].y,
  );
});

test("长图坐标同时包含数值刻度、日期范围和图内参考线", () => {
  const geometry = buildShareChartGeometry(
    [
      {
        label: "收缩压",
        color: "green",
        references: [{ value: 140, label: "参考 140" }],
        points: [
          {
            occurredAt: "2026-08-01T08:00:00.000Z",
            value: 120,
            valueLabel: "120",
          },
          {
            occurredAt: "2026-08-02T08:00:00.000Z",
            value: 130,
            valueLabel: "130",
          },
        ],
      },
    ],
    { width: 500, height: 200 },
  );

  assert.deepEqual(
    geometry.yAxis.map((tick) => tick.value),
    [140, 130, 120],
  );
  assert.deepEqual(geometry.xAxis, {
    start: "2026-08-01T08:00:00.000Z",
    end: "2026-08-02T08:00:00.000Z",
  });
  assert.equal(geometry.references[0].label, "参考 140");
  assert.equal(geometry.references[0].y, 24);
});

test("旧版 canvas 未回调时用短超时结束等待，避免保存按钮永久转圈", async () => {
  let scheduled;
  const waiting = waitForCanvasDraw(
    () => {},
    {
      setTimer: (callback) => {
        scheduled = callback;
        return 1;
      },
      clearTimer: () => {},
    },
  );

  scheduled();
  assert.equal(await waiting, "timeout");
});
