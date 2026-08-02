function buildLinePolygon(fromPosition, toPosition) {
  const fromTop = 100 - fromPosition;
  const toTop = 100 - toPosition;
  return [
    `0% ${fromTop - 1}%`,
    `0% ${fromTop + 1}%`,
    `100% ${toTop + 1}%`,
    `100% ${toTop - 1}%`,
  ].join(", ");
}

function roundTick(value) {
  return Number(value.toFixed(1));
}

function getReferences(view, seriesKey) {
  if (view.type === "blood_pressure") {
    return seriesKey === "systolic"
      ? [{ value: 140, label: "参考 140" }]
      : [{ value: 90, label: "参考 90" }];
  }

  if (view.type !== "blood_glucose") {
    return [];
  }

  if (view.measurementScene === "fasting") {
    return [
      { value: 3.9, label: "空腹下限 3.9" },
      { value: 6.1, label: "空腹上限 6.1" },
    ];
  }

  if (view.measurementScene === "after_meal_2h") {
    return [{ value: 7.8, label: "餐后 2h 7.8" }];
  }

  if (view.measurementScene === "all") {
    return [
      { value: 3.9, label: "空腹 3.9" },
      { value: 6.1, label: "空腹 6.1" },
      { value: 7.8, label: "餐后 2h 7.8" },
    ];
  }

  return [];
}

function buildPosition(value, minimum, maximum) {
  return Math.round(
    10 + ((value - minimum) / (maximum - minimum)) * 80,
  );
}

function buildChart(view, series) {
  const references = getReferences(view, series.key);
  const values = [
    ...series.points.map((point) => point.value),
    ...references.map((reference) => reference.value),
  ];
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);

  if (minimum === maximum) {
    minimum -= 1;
    maximum += 1;
  }

  const points = series.points.map((point) => ({
    ...point,
    position: buildPosition(point.value, minimum, maximum),
    valueLabel: String(point.value),
  }));

  return {
    ...series,
    points: points.map((point, index) => ({
      ...point,
      linePolygon:
        index < points.length - 1
          ? buildLinePolygon(
              point.position,
              points[index + 1].position,
            )
          : "",
    })),
    yAxis: [
      { value: roundTick(maximum), position: 90 },
      {
        value: roundTick((minimum + maximum) / 2),
        position: 50,
      },
      { value: roundTick(minimum), position: 10 },
    ],
    xAxis: {
      start: series.points[0]?.occurredAt || "",
      end: series.points[series.points.length - 1]?.occurredAt || "",
    },
    references: references.map((reference) => ({
      ...reference,
      position: buildPosition(reference.value, minimum, maximum),
    })),
    referenceSummary: view.reference?.value || "",
  };
}

function buildAnalysisChartSeries(view) {
  return (view.series || [])
    .filter((series) => series.points.length > 0)
    .map((series) => buildChart(view, series));
}

module.exports = {
  buildAnalysisChartSeries,
};
