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

function getHealthReferenceLines(templateId, fieldKey) {
  if (templateId === "sys_blood_pressure") {
    if (fieldKey === "systolic") {
      return [{ value: 140, label: "参考 140" }];
    }
    if (fieldKey === "diastolic") {
      return [{ value: 90, label: "参考 90" }];
    }
  }

  if (
    templateId === "sys_blood_glucose" &&
    fieldKey === "glucose"
  ) {
    return [
      { value: 3.9, label: "空腹下限 3.9" },
      { value: 6.1, label: "空腹上限 6.1" },
      { value: 7.8, label: "餐后 2h 7.8" },
    ];
  }

  return [];
}

function buildTrendChart(points = [], references = []) {
  if (points.length === 0) {
    return {
      points: [],
      references: [],
      yAxis: [],
      xAxis: { start: "", end: "" },
    };
  }

  const values = [
    ...points.map((point) => point.value),
    ...references.map((reference) => reference.value),
  ];
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);

  if (minimum === maximum) {
    minimum -= 1;
    maximum += 1;
  }

  const distance = maximum - minimum;
  const toPosition = (value) =>
    Math.round(((value - minimum) / distance) * 80) + 10;
  const plottedPoints = points.map((point) => ({
    ...point,
    position: toPosition(point.value),
  }));

  return {
    points: plottedPoints.map((point, index) => ({
      ...point,
      linePolygon:
        index < plottedPoints.length - 1
          ? buildLinePolygon(
              point.position,
              plottedPoints[index + 1].position,
            )
          : "",
    })),
    references: references.map((reference) => ({
      ...reference,
      position: toPosition(reference.value),
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
      start: points[0]?.occurredAt || "",
      end: points[points.length - 1]?.occurredAt || "",
    },
  };
}

function buildTrendPlot(points = []) {
  return buildTrendChart(points).points;
}

module.exports = {
  buildTrendChart,
  buildTrendPlot,
  getHealthReferenceLines,
};
