const SYSTEM_TEMPLATES = [
  {
    id: "sys_temperature",
    sourceType: "system",
    name: "体温",
    fields: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
  },
  {
    id: "sys_blood_pressure",
    sourceType: "system",
    name: "血压",
    fields: [
      {
        key: "systolic",
        label: "收缩压",
        type: "number",
        unit: "mmHg",
        required: true,
        sortOrder: 10,
      },
      {
        key: "diastolic",
        label: "舒张压",
        type: "number",
        unit: "mmHg",
        required: true,
        sortOrder: 20,
      },
    ],
  },
  {
    id: "sys_blood_glucose",
    sourceType: "system",
    name: "血糖",
    fields: [
      {
        key: "glucose",
        label: "血糖",
        type: "number",
        unit: "mmol/L",
        required: true,
        sortOrder: 10,
      },
      {
        key: "measurementScene",
        label: "测量场景",
        type: "single_choice",
        required: false,
        sortOrder: 20,
        options: [
          { key: "fasting", label: "空腹", sortOrder: 10 },
          { key: "before_meal", label: "餐前", sortOrder: 20 },
          {
            key: "after_meal_2h",
            label: "餐后 2 小时",
            sortOrder: 30,
          },
          { key: "bedtime", label: "睡前", sortOrder: 40 },
          { key: "random", label: "随机", sortOrder: 50 },
        ],
      },
    ],
  },
  {
    id: "sys_medication",
    sourceType: "system",
    name: "用药",
    fields: [
      {
        key: "medicineName",
        label: "药品名称",
        type: "short_text",
        required: true,
        sortOrder: 10,
      },
      {
        key: "dosage",
        label: "用量",
        type: "short_text",
        required: false,
        sortOrder: 20,
      },
    ],
  },
];

function cloneTemplate(template) {
  return {
    ...template,
    fields: template.fields.map((field) => ({
      ...field,
      ...(Array.isArray(field.options)
        ? {
            options: field.options.map((option) => ({ ...option })),
          }
        : {}),
    })),
  };
}

function listSystemTemplates() {
  return SYSTEM_TEMPLATES.map(cloneTemplate);
}

function getSystemTemplate(templateId) {
  const template = SYSTEM_TEMPLATES.find(
    (candidate) => candidate.id === templateId,
  );
  return template ? cloneTemplate(template) : null;
}

module.exports = {
  getSystemTemplate,
  listSystemTemplates,
};
