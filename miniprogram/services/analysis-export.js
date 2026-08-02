const {
  buildAnalysisView,
} = require("./analysis-view");

const HEADERS = [
  "类型",
  "成员",
  "时间",
  "收缩压(mmHg)",
  "舒张压(mmHg)",
  "血糖(mmol/L)",
  "测量场景",
  "药品名称",
  "用量",
  "完成状态",
];

const SCENE_LABELS = {
  fasting: "空腹",
  before_meal: "餐前",
  after_meal_2h: "餐后 2 小时",
  bedtime: "睡前",
  random: "随机",
  unclassified: "未分类",
};

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toBloodPressureRows(view) {
  return view.records.map((record) => ({
    type: "血压记录",
    member: record.subject.displayName,
    time: formatDateTime(record.occurredAt),
    systolic: record.values.systolic,
    diastolic: record.values.diastolic,
  }));
}

function toBloodGlucoseRows(view) {
  return view.records.map((record) => ({
    type: "血糖记录",
    member: record.subject.displayName,
    time: formatDateTime(record.occurredAt),
    glucose: record.values.glucose,
    measurementScene:
      SCENE_LABELS[
        record.values.measurementScene || "unclassified"
      ] || "未分类",
  }));
}

function toMedicationRows(view) {
  const reminderRows = view.reminders.map((reminder) => ({
    type: "用药提醒",
    member: reminder.subject.displayName,
    time: formatDateTime(reminder.plannedAt),
    medicineName: reminder.values.medicineName || "",
    dosage: reminder.values.dosage || "",
    status:
      reminder.status === "completed" ? "已完成" : "未完成",
  }));
  const historyRows = view.history.map((record) => ({
    type: "用药记录",
    member: record.subject.displayName,
    time: formatDateTime(record.occurredAt),
    medicineName: record.values.medicineName || "",
    dosage: record.values.dosage || "",
    status: "已记录",
  }));

  return [...reminderRows, ...historyRows].sort((left, right) =>
    right.time.localeCompare(left.time),
  );
}

function buildAnalysisRows({
  type,
  analysisData,
  filters,
  now = new Date(),
}) {
  const types = type
    ? [type]
    : ["blood_pressure", "blood_glucose", "medication"];

  return types.flatMap((analysisType) => {
    const view = buildAnalysisView({
      type: analysisType,
      analysisData,
      filters,
      now,
    });

    if (analysisType === "blood_pressure") {
      return toBloodPressureRows(view);
    }

    if (analysisType === "blood_glucose") {
      return toBloodGlucoseRows(view);
    }

    return toMedicationRows(view);
  });
}

function escapeCsv(value) {
  let text = value === undefined || value === null ? "" : String(value);

  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function buildAnalysisCsv(options) {
  const table = buildAnalysisTable(options);

  return `\uFEFF${[table.headers, ...table.rows]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n")}`;
}

function buildAnalysisTable(options) {
  const rows = buildAnalysisRows(options);
  const values = rows.map((row) => [
    row.type,
    row.member,
    row.time,
    row.systolic,
    row.diastolic,
    row.glucose,
    row.measurementScene,
    row.medicineName,
    row.dosage,
    row.status,
  ]);

  return {
    headers: [...HEADERS],
    rows: values,
  };
}

module.exports = {
  buildAnalysisCsv,
  buildAnalysisRows,
  buildAnalysisTable,
  formatDateTime,
};
