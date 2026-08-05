const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTemplateApi,
} = require("../cloudfunctions/template-api/src/create-template-api");
const {
  createInMemoryTemplateStore,
} = require("./support/create-in-memory-template-store");

function createTemplateApiFor({
  callerUserId = "user-1",
  membership = {
    familyId: "family-1",
    userId: "user-1",
    status: "active",
  },
  createId = (kind) => `${kind}-1`,
  now = new Date("2026-07-29T04:00:00.000Z"),
} = {}) {
  const templateStore = createInMemoryTemplateStore({
    memberships: membership ? [membership] : [],
  });

  return createTemplateApi({
    getCaller: async () => ({ _id: callerUserId }),
    templateStore,
    createId,
    now: () => now,
    reportError(error) {
      throw error;
    },
  });
}

test("有效家庭成员可以读取四个系统模板", async () => {
  const api = createTemplateApiFor();

  const result = await api.handle({
    action: "listTemplates",
    requestId: "req-list-system-templates",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.templates.map(({ id, name }) => ({ id, name })),
    [
      { id: "sys_temperature", name: "体温" },
      { id: "sys_blood_pressure", name: "血压" },
      { id: "sys_blood_glucose", name: "血糖" },
      { id: "sys_medication", name: "用药" },
    ],
  );
  assert.deepEqual(result.data.templates[0].fields, [
    {
      key: "temperature",
      label: "体温",
      type: "number",
      unit: "℃",
      required: true,
      sortOrder: 10,
    },
  ]);
});

test("系统血糖模板提供可用于预设分析的测量场景", async () => {
  const api = createTemplateApiFor();

  const result = await api.handle({
    action: "listTemplates",
    data: {
      familyId: "family-1",
    },
  });
  const bloodGlucose = result.data.templates.find(
    (template) => template.id === "sys_blood_glucose",
  );

  assert.deepEqual(bloodGlucose.fields[1], {
    key: "measurementScene",
    label: "测量场景",
    type: "single_choice",
    required: false,
    sortOrder: 20,
    options: [
      { key: "fasting", label: "空腹", sortOrder: 10 },
      { key: "before_meal", label: "餐前", sortOrder: 20 },
      { key: "after_meal_2h", label: "餐后 2 小时", sortOrder: 30 },
      { key: "bedtime", label: "睡前", sortOrder: 40 },
      { key: "random", label: "随机", sortOrder: 50 },
    ],
  });
});

test("有效家庭成员可以创建家庭自定义模板", async () => {
  const api = createTemplateApiFor({
    createId(kind) {
      return {
        template: "template-1",
        "field-0": "field-1",
      }[kind];
    },
  });

  const result = await api.handle({
    action: "createCustomTemplate",
    requestId: "req-create-morning-template",
    data: {
      familyId: "family-1",
      name: "晨间状态",
      colorKey: "blue",
      fields: [
        {
          label: "晨间心情",
          type: "short_text",
          required: true,
        },
      ],
    },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-create-morning-template",
    data: {
      template: {
        id: "template-1",
        familyId: "family-1",
        sourceType: "custom",
        name: "晨间状态",
        colorKey: "blue",
        status: "active",
        fields: [
          {
            key: "field-1",
            label: "晨间心情",
            type: "short_text",
            required: true,
            status: "active",
            sortOrder: 10,
          },
        ],
        revision: 1,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
        createdAt: "2026-07-29T04:00:00.000Z",
        updatedAt: "2026-07-29T04:00:00.000Z",
      },
      replayed: false,
    },
  });
});

test("自定义模板可以保存规范化的十六进制颜色", async () => {
  const api = createTemplateApiFor({
    createId(kind) {
      return {
        template: "template-color",
        "field-0": "field-color",
      }[kind];
    },
  });

  const result = await api.handle({
    action: "createCustomTemplate",
    requestId: "req-create-colored-template",
    data: {
      familyId: "family-1",
      name: "脉搏",
      colorKey: "custom",
      colorHex: "#3a7f91",
      fields: [
        {
          label: "脉搏",
          type: "number",
          unit: "次/分",
          required: true,
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.template.colorKey, "custom");
  assert.equal(result.data.template.colorHex, "#3A7F91");
});

test("自定义模板拒绝可能注入样式的非法颜色代码", async () => {
  const api = createTemplateApiFor();
  const result = await api.handle({
    action: "createCustomTemplate",
    requestId: "req-invalid-color",
    data: {
      familyId: "family-1",
      name: "非法颜色",
      colorKey: "custom",
      colorHex: "#fff;background:red",
      fields: [{ label: "数值", type: "number" }],
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "INVALID_ARGUMENT");
});

test("模板改名或停用字段后旧记录仍保留原快照", async () => {
  const originalRecord = {
    _id: "record-1",
    familyId: "family-1",
    sourceTemplateType: "custom",
    sourceTemplateId: "template-1",
    templateNameSnapshot: "晨间状态",
    fieldSchemaSnapshot: [
      {
        key: "field-mood",
        label: "晨间心情",
        type: "short_text",
        required: false,
        sortOrder: 10,
      },
    ],
    values: {
      "field-mood": "精神很好",
    },
  };
  const templateStore = createInMemoryTemplateStore({
    memberships: [
      {
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
    templates: [
      {
        _id: "template-1",
        familyId: "family-1",
        originTemplateId: "template-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: false,
            status: "active",
            sortOrder: 10,
          },
          {
            key: "field-note",
            label: "补充说明",
            type: "short_text",
            required: false,
            status: "active",
            sortOrder: 20,
          },
        ],
        defaultNotificationTimes: [],
        sortOrder: 100,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
        revision: 1,
        createdAt: new Date("2026-07-29T04:00:00.000Z"),
        updatedAt: new Date("2026-07-29T04:00:00.000Z"),
      },
    ],
    records: [originalRecord],
  });
  const api = createTemplateApi({
    getCaller: async () => ({ _id: "user-1" }),
    templateStore,
    createId: (kind) => kind,
    now: () => new Date("2026-07-29T04:30:00.000Z"),
  });

  const result = await api.handle({
    action: "updateCustomTemplate",
    requestId: "req-update-morning-template",
    data: {
      familyId: "family-1",
      templateId: "template-1",
      expectedRevision: 1,
      name: "早晨状态",
      fields: [
        {
          key: "field-mood",
          label: "起床感受",
          type: "short_text",
          required: false,
          status: "inactive",
        },
        {
          key: "field-note",
          label: "补充说明",
          type: "short_text",
          required: false,
          status: "active",
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.template.name, "早晨状态");
  assert.equal(result.data.template.fields[0].status, "inactive");
  assert.equal(result.data.template.revision, 2);
  assert.deepEqual(
    templateStore.inspectRecords()[0],
    originalRecord,
  );
});

test("已经产生记录的模板字段不能被破坏性删除", async () => {
  const templateStore = createInMemoryTemplateStore({
    memberships: [
      {
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
    templates: [
      {
        _id: "template-1",
        familyId: "family-1",
        originTemplateId: "template-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: false,
            status: "active",
            sortOrder: 10,
          },
          {
            key: "field-note",
            label: "补充说明",
            type: "short_text",
            required: false,
            status: "active",
            sortOrder: 20,
          },
        ],
        defaultNotificationTimes: [],
        sortOrder: 100,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
        revision: 1,
        createdAt: new Date("2026-07-29T04:00:00.000Z"),
        updatedAt: new Date("2026-07-29T04:00:00.000Z"),
      },
    ],
    records: [
      {
        _id: "record-1",
        familyId: "family-1",
        sourceTemplateType: "custom",
        sourceTemplateId: "template-1",
        fieldSchemaSnapshot: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: false,
            sortOrder: 10,
          },
        ],
        values: {
          "field-mood": "精神很好",
        },
      },
    ],
  });
  const api = createTemplateApi({
    getCaller: async () => ({ _id: "user-1" }),
    templateStore,
    createId: (kind) => kind,
    now: () => new Date("2026-07-29T05:00:00.000Z"),
  });

  const result = await api.handle({
    action: "updateCustomTemplate",
    requestId: "req-remove-used-field",
    data: {
      familyId: "family-1",
      templateId: "template-1",
      expectedRevision: 1,
      name: "晨间状态",
      fields: [
        {
          key: "field-note",
          label: "补充说明",
          type: "short_text",
          required: false,
          status: "active",
        },
      ],
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-remove-used-field",
    error: {
      code: "TEMPLATE_HISTORY_CONFLICT",
      message: "已有记录使用这个字段，可以停用但不能删除或改变类型",
    },
  });
  assert.equal(templateStore.inspectTemplates()[0].revision, 1);
});

test("有效家庭成员可以停用自定义模板", async () => {
  const templateStore = createInMemoryTemplateStore({
    memberships: [
      {
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
    templates: [
      {
        _id: "template-1",
        familyId: "family-1",
        originTemplateId: "template-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: false,
            status: "active",
            sortOrder: 10,
          },
        ],
        defaultNotificationTimes: [],
        sortOrder: 100,
        createdByUserId: "user-1",
        updatedByUserId: "user-1",
        revision: 1,
        createdAt: new Date("2026-07-29T04:00:00.000Z"),
        updatedAt: new Date("2026-07-29T04:00:00.000Z"),
      },
    ],
  });
  const api = createTemplateApi({
    getCaller: async () => ({ _id: "user-1" }),
    templateStore,
    createId: (kind) => kind,
    now: () => new Date("2026-07-29T05:30:00.000Z"),
  });

  const result = await api.handle({
    action: "setTemplateStatus",
    requestId: "req-disable-template",
    data: {
      familyId: "family-1",
      templateId: "template-1",
      expectedRevision: 1,
      status: "inactive",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.template.status, "inactive");
  assert.equal(result.data.template.revision, 2);

  const activeList = await api.handle({
    action: "listTemplates",
    requestId: "req-list-active-templates",
    data: {
      familyId: "family-1",
    },
  });
  assert.equal(
    activeList.data.templates.some(
      (template) => template.id === "template-1",
    ),
    false,
  );
});

test("自定义单选字段保存稳定选项编号", async () => {
  const templateStore = createInMemoryTemplateStore({
    memberships: [
      {
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
  });
  const ids = {
    template: "template-choice",
    "field-0": "field-mood",
    "option-0-0": "option-good",
    "option-0-1": "option-tired",
  };
  const api = createTemplateApi({
    getCaller: async () => ({ _id: "user-1" }),
    templateStore,
    createId: (kind) => ids[kind],
    now: () => new Date("2026-07-29T06:00:00.000Z"),
  });

  const result = await api.handle({
    action: "createCustomTemplate",
    requestId: "req-create-choice-template",
    data: {
      familyId: "family-1",
      name: "晨间状态",
      fields: [
        {
          label: "精神状态",
          type: "single_choice",
          required: true,
          options: [
            { label: "很好" },
            { label: "疲惫" },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.template.fields[0].options, [
    {
      key: "option-good",
      label: "很好",
      status: "active",
      sortOrder: 10,
    },
    {
      key: "option-tired",
      label: "疲惫",
      status: "active",
      sortOrder: 20,
    },
  ]);
});
