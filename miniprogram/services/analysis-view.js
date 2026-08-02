const DAY_MS = 24 * 60 * 60 * 1000;
const BLOOD_GLUCOSE_SCENES = [
  {
    key: "fasting",
    label: "空腹",
    reference: "3.9–6.1 mmol/L",
  },
  {
    key: "before_meal",
    label: "餐前",
    reference: "请以医生建议为准",
  },
  {
    key: "after_meal_2h",
    label: "餐后 2 小时",
    reference: "<7.8 mmol/L",
  },
  {
    key: "bedtime",
    label: "睡前",
    reference: "请以医生建议为准",
  },
  {
    key: "random",
    label: "随机",
    reference: "请以医生建议为准",
  },
  {
    key: "unclassified",
    label: "未分类",
    reference: "请选择测量场景后查看参考",
  },
];

function getRangeStart(timeRange, now) {
  const days = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
  }[timeRange];

  return days ? new Date(now.getTime() - days * DAY_MS) : null;
}

function matchesFilters(item, filters, dateField, now) {
  if (
    filters.memberIds?.length > 0 &&
    !filters.memberIds.includes(item.subject.id)
  ) {
    return false;
  }

  const rangeStart = getRangeStart(filters.timeRange, now);
  return (
    !rangeStart ||
    new Date(item[dateField]).getTime() >= rangeStart.getTime()
  );
}

function summarize(values, label, unit) {
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    label,
    average: Number((total / values.length).toFixed(1)),
    minimum: Math.min(...values),
    maximum: Math.max(...values),
    unit,
  };
}

function getAverage(values) {
  if (values.length === 0) {
    return null;
  }

  return Number(
    (
      values.reduce((sum, value) => sum + value, 0) /
      values.length
    ).toFixed(1),
  );
}

function buildBloodPressureAnalysis({ analysisData, filters, now }) {
  const records = (analysisData.records || [])
    .filter(
      (record) =>
        record.analysisType === "blood_pressure" &&
        typeof record.values?.systolic === "number" &&
        typeof record.values?.diastolic === "number" &&
        matchesFilters(record, filters, "occurredAt", now),
    )
    .sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() -
        new Date(right.occurredAt).getTime(),
    );
  const systolicValues = records.map(
    (record) => record.values.systolic,
  );
  const diastolicValues = records.map(
    (record) => record.values.diastolic,
  );

  return {
    type: "blood_pressure",
    title: "血压分析",
    count: records.length,
    metrics:
      records.length === 0
        ? null
        : {
            systolic: summarize(
              systolicValues,
              "收缩压",
              "mmHg",
            ),
            diastolic: summarize(
              diastolicValues,
              "舒张压",
              "mmHg",
            ),
          },
    series: [
      {
        key: "systolic",
        label: "收缩压",
        unit: "mmHg",
        points: records.map((record) => ({
          recordId: record.id,
          occurredAt: record.occurredAt,
          value: record.values.systolic,
        })),
      },
      {
        key: "diastolic",
        label: "舒张压",
        unit: "mmHg",
        points: records.map((record) => ({
          recordId: record.id,
          occurredAt: record.occurredAt,
          value: record.values.diastolic,
        })),
      },
    ],
    records,
    reference: {
      label: "高血压参考阈值",
      value: "收缩压 ≥140 或舒张压 ≥90 mmHg",
      note: "需要在不同日期复测；个人目标请以医生建议为准。",
    },
  };
}

function buildBloodGlucoseAnalysis({ analysisData, filters, now }) {
  const rangeStart = getRangeStart(filters.timeRange, now);
  const rangeDuration = rangeStart
    ? now.getTime() - rangeStart.getTime()
    : null;
  const previousStart = rangeStart
    ? new Date(rangeStart.getTime() - rangeDuration)
    : null;
  const sceneFilter = filters.measurementScene || "all";
  const allMatchingRecords = (analysisData.records || []).filter(
    (record) =>
      record.analysisType === "blood_glucose" &&
      typeof record.values?.glucose === "number" &&
      (!filters.memberIds?.length ||
        filters.memberIds.includes(record.subject.id)) &&
      (sceneFilter === "all" ||
        (record.values.measurementScene || "unclassified") ===
          sceneFilter),
  );
  const records = allMatchingRecords
    .filter(
      (record) =>
        !rangeStart ||
        new Date(record.occurredAt).getTime() >= rangeStart.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(left.occurredAt).getTime() -
        new Date(right.occurredAt).getTime(),
    );
  const glucoseValues = records.map(
    (record) => record.values.glucose,
  );
  const previousRecords = rangeStart
    ? allMatchingRecords.filter((record) => {
        const occurredAt = new Date(record.occurredAt).getTime();
        return (
          occurredAt >= previousStart.getTime() &&
          occurredAt < rangeStart.getTime()
        );
      })
    : [];
  const previousAverage = getAverage(
    previousRecords.map((record) => record.values.glucose),
  );
  const currentAverage = getAverage(glucoseValues);
  const sceneGroups = BLOOD_GLUCOSE_SCENES.map((scene) => {
    const sceneValues = records
      .filter(
        (record) =>
          (record.values.measurementScene || "unclassified") ===
          scene.key,
      )
      .map((record) => record.values.glucose);

    return {
      ...scene,
      count: sceneValues.length,
      average: getAverage(sceneValues),
    };
  }).filter((scene) => scene.count > 0);

  return {
    type: "blood_glucose",
    title: "血糖分析",
    measurementScene: sceneFilter,
    count: records.length,
    metrics:
      records.length === 0
        ? null
        : {
            glucose: summarize(
              glucoseValues,
              "血糖",
              "mmol/L",
            ),
          },
    sceneGroups,
    comparison:
      rangeStart &&
      currentAverage !== null &&
      previousAverage !== null
        ? {
            currentAverage,
            previousAverage,
            change: Number(
              (currentAverage - previousAverage).toFixed(1),
            ),
            label: `较前 ${Math.round(rangeDuration / DAY_MS)} 天`,
          }
        : null,
    series: [
      {
        key: "glucose",
        label: "血糖",
        unit: "mmol/L",
        points: records.map((record) => ({
          recordId: record.id,
          occurredAt: record.occurredAt,
          value: record.values.glucose,
        })),
      },
    ],
    records,
    reference: {
      label: "常见成人参考",
      value: "空腹 3.9–6.1；餐后 2 小时 <7.8 mmol/L",
      note: "孕期、已确诊糖尿病或其他特殊情况应采用医生给出的个体目标。",
    },
  };
}

function buildMedicationAnalysis({ analysisData, filters, now }) {
  const reminders = (analysisData.medicationReminders || [])
    .filter(
      (reminder) =>
        matchesFilters(reminder, filters, "plannedAt", now) &&
        new Date(reminder.plannedAt).getTime() <= now.getTime(),
    )
    .sort(
      (left, right) =>
        new Date(right.plannedAt).getTime() -
        new Date(left.plannedAt).getTime(),
    );
  const completed = reminders.filter(
    (reminder) => reminder.status === "completed",
  ).length;
  const history = (analysisData.records || [])
    .filter(
      (record) =>
        record.analysisType === "medication" &&
        matchesFilters(record, filters, "occurredAt", now),
    )
    .sort(
      (left, right) =>
        new Date(right.occurredAt).getTime() -
        new Date(left.occurredAt).getTime(),
    );

  return {
    type: "medication",
    title: "用药完成分析",
    count: reminders.length,
    summary: {
      planned: reminders.length,
      completed,
      rate:
        reminders.length === 0
          ? 0
          : Math.round((completed / reminders.length) * 100),
    },
    reminders,
    incompleteReminders: reminders.filter(
      (reminder) => reminder.status !== "completed",
    ),
    history,
    records: history,
    series: [],
  };
}

function buildAnalysisView({
  type,
  analysisData = {},
  filters = {},
  now = new Date(),
}) {
  if (type === "blood_pressure") {
    return buildBloodPressureAnalysis({
      analysisData,
      filters,
      now,
    });
  }

  if (type === "blood_glucose") {
    return buildBloodGlucoseAnalysis({
      analysisData,
      filters,
      now,
    });
  }

  if (type === "medication") {
    return buildMedicationAnalysis({
      analysisData,
      filters,
      now,
    });
  }

  return {
    type,
    title: "进阶分析",
    count: 0,
    metrics: null,
    series: [],
    records: [],
  };
}

module.exports = {
  buildAnalysisView,
};
