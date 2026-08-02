const {
  buildAnalysisChartSeries,
} = require("./analysis-chart");

function metricLine(metric) {
  return `${metric.label} 平均 ${metric.average} ${metric.unit} · 最低 ${
    metric.minimum
  } · 最高 ${metric.maximum}`;
}

function buildSummaryLines(view) {
  if (view.type === "medication") {
    return [
      `计划 ${view.summary.planned} 次 · 完成 ${view.summary.completed} 次`,
      `完成率 ${view.summary.rate}% · 未完成 ${
        view.incompleteReminders.length
      } 次`,
      `实际用药记录 ${view.history.length} 条`,
    ];
  }

  const metrics = Object.values(view.metrics || {});
  return [
    `共 ${view.count} 条数据`,
    ...metrics.map(metricLine),
  ];
}

function buildShareChartGeometry(
  chartSeries = [],
  { width, height },
) {
  const seriesWithPoints = chartSeries.filter(
    (series) => series.points.length > 0,
  );
  const values = seriesWithPoints.flatMap((series) =>
    [
      ...series.points.map((point) => point.value),
      ...(series.references || []).map(
        (reference) => reference.value,
      ),
    ],
  );

  if (values.length === 0) {
    return {
      series: [],
      references: [],
      yAxis: [],
      xAxis: { start: "", end: "" },
      minimum: null,
      maximum: null,
    };
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const distance = maximum - minimum;
  const verticalPadding = 24;
  const drawableHeight = height - verticalPadding * 2;
  const toY = (value) =>
    distance === 0
      ? height / 2
      : verticalPadding +
        (1 - (value - minimum) / distance) * drawableHeight;
  const occurredAts = seriesWithPoints
    .flatMap((series) =>
      series.points.map((point) => point.occurredAt),
    )
    .filter(Boolean)
    .sort(
      (left, right) =>
        new Date(left).getTime() - new Date(right).getTime(),
    );
  const seenReferences = new Set();
  const references = seriesWithPoints.flatMap((series) =>
    (series.references || []).flatMap((reference) => {
      const key = `${reference.value}:${reference.label}`;
      if (seenReferences.has(key)) {
        return [];
      }
      seenReferences.add(key);
      return [
        {
          ...reference,
          color: series.color,
          y: toY(reference.value),
        },
      ];
    }),
  );

  return {
    minimum,
    maximum,
    yAxis: [
      { value: maximum, y: verticalPadding },
      {
        value: Number(((minimum + maximum) / 2).toFixed(1)),
        y: height / 2,
      },
      { value: minimum, y: height - verticalPadding },
    ],
    xAxis: {
      start: occurredAts[0] || "",
      end: occurredAts[occurredAts.length - 1] || "",
    },
    references,
    series: seriesWithPoints.map((series, seriesIndex) => ({
      ...series,
      points: series.points.map((point, pointIndex) => ({
        ...point,
        x:
          series.points.length === 1
            ? width / 2
            : (pointIndex / (series.points.length - 1)) * width,
        y: toY(point.value),
        labelOffsetY: seriesIndex % 2 === 0 ? -13 : 25,
      })),
    })),
  };
}

function buildAnalysisShareImage({
  familyName,
  memberLabel,
  timeRangeLabel,
  view,
}) {
  const noticeLines = ["数据仅供日常健康管理，不构成医疗诊断。"];

  if (view.reference) {
    noticeLines.push(
      `${view.reference.label}：${view.reference.value}`,
      view.reference.note,
    );
  }

  const colors = ["#2e6f68", "#c65b4f", "#4d6f8d"];
  const chartSeries = buildAnalysisChartSeries(view).map(
    (series, index) => ({
      ...series,
      color: colors[index % colors.length],
    }),
  );

  return {
    title: view.title,
    filterLine: `${familyName} · ${memberLabel} · ${timeRangeLabel}`,
    summaryLines: buildSummaryLines(view),
    noticeLines,
    chartSeries,
  };
}

function waitForCanvasDraw(
  draw,
  {
    timeoutMs = 1200,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  } = {},
) {
  return new Promise((resolve, reject) => {
    let finished = false;
    let timerId;
    const finish = (reason) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimer(timerId);
      resolve(reason);
    };

    timerId = setTimer(() => finish("timeout"), timeoutMs);
    try {
      draw(() => finish("draw"));
    } catch (error) {
      finished = true;
      clearTimer(timerId);
      reject(error);
    }
  });
}

module.exports = {
  buildAnalysisShareImage,
  buildShareChartGeometry,
  waitForCanvasDraw,
};
