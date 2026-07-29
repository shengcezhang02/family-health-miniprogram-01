const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createHealthItemApi,
} = require("../cloudfunctions/health-item-api/src/create-health-item-api");
const {
  getSystemTemplate,
} = require("../cloudfunctions/template-api/src/system-templates");
const {
  createInMemoryHealthItemStore,
} = require("./support/create-in-memory-health-item-store");

function createUser({
  id = "user-1",
  openId = "openid-1",
  displayName = "用户一",
} = {}) {
  return {
    _id: id,
    wechatOpenId: openId,
    displayName,
  };
}

function createMembership({
  id,
  familyId = "family-1",
  userId,
  status = "active",
} = {}) {
  return {
    _id: id ?? `${familyId}-${userId}`,
    familyId,
    userId,
    status,
  };
}

function createApiFor({
  caller = createUser(),
  subject = caller,
  memberships = [
    createMembership({
      userId: caller._id,
    }),
  ],
  templates = [],
  records = [],
  now = new Date("2026-07-29T01:30:00.000Z"),
  createRecordId = () => "record-1",
} = {}) {
  const healthItemStore = createInMemoryHealthItemStore({
    users: caller === subject ? [caller] : [caller, subject],
    memberships,
    templates,
    records,
  });
  const api = createHealthItemApi({
    getCaller: async () => structuredClone(caller),
    healthItemStore,
    getSystemTemplate,
    createRecordId,
    now: () => now,
  });

  return {
    api,
    healthItemStore,
  };
}

test("有效成员可以为家庭中的有效成员创建体温记录", async () => {
  const caller = createUser();
  const subject = createUser({
    id: "user-2",
    openId: "openid-2",
    displayName: "用户二",
  });
  const { api, healthItemStore } = createApiFor({
    caller,
    subject,
    memberships: [
      createMembership({ userId: caller._id }),
      createMembership({ userId: subject._id }),
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-temperature",
    data: {
      familyId: "family-1",
      subjectUserId: subject._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.7,
      },
      remark: "晨起测量",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.record.id, "record-1");
  assert.deepEqual(healthItemStore.inspectRecords(), [
    {
      _id: "record-1",
      familyId: "family-1",
      subjectUserId: subject._id,
      sourceTemplateType: "system",
      sourceTemplateId: "sys_temperature",
      templateNameSnapshot: "体温",
      fieldSchemaSnapshot: [
        {
          key: "temperature",
          label: "体温",
          type: "number",
          unit: "℃",
          required: true,
          sortOrder: 10,
        },
      ],
      values: {
        temperature: 36.7,
      },
      remark: "晨起测量",
      occurredAt: new Date("2026-07-29T01:20:00.000Z"),
      recordSource: "manual",
      createdByUserId: caller._id,
      updatedByUserId: caller._id,
      revision: 1,
      createdAt: new Date("2026-07-29T01:30:00.000Z"),
      updatedAt: new Date("2026-07-29T01:30:00.000Z"),
      originRecordId: "record-1",
    },
  ]);
});

test("家庭外用户不能读取家庭健康记录", async () => {
  const caller = createUser({
    id: "outsider",
    openId: "outsider-openid",
  });
  const { api } = createApiFor({
    caller,
    memberships: [],
    records: [
      {
        _id: "record-private",
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateType: "system",
        sourceTemplateId: "sys_temperature",
        templateNameSnapshot: "体温",
        fieldSchemaSnapshot: [],
        values: { temperature: 36.5 },
        occurredAt: new Date("2026-07-29T01:20:00.000Z"),
        recordSource: "manual",
        createdByUserId: "user-2",
        updatedByUserId: "user-2",
        revision: 1,
        createdAt: new Date("2026-07-29T01:20:00.000Z"),
        updatedAt: new Date("2026-07-29T01:20:00.000Z"),
        originRecordId: "record-private",
      },
    ],
  });

  const result = await api.handle({
    action: "getHealthItem",
    requestId: "req-outsider-read-record",
    data: {
      recordId: "record-private",
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-outsider-read-record",
    error: {
      code: "HEALTH_ITEM_ACCESS_DENIED",
      message: "只有当前家庭的有效成员可以查看记录",
    },
  });
});

test("云端忽略伪造审计人，并且不保存空备注", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({ caller });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-forged-audit-fields",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.8,
      },
      remark: "   ",
      createdByUserId: "forged-user",
      updatedByUserId: "forged-user",
      templateNameSnapshot: "伪造模板名",
    },
  });

  const [saved] = healthItemStore.inspectRecords();
  assert.equal(result.ok, true);
  assert.equal(saved.createdByUserId, caller._id);
  assert.equal(saved.updatedByUserId, caller._id);
  assert.equal(saved.templateNameSnapshot, "体温");
  assert.equal(Object.hasOwn(saved, "remark"), false);
});

test("同一用户使用同一个 requestId 重试不会产生两条记录", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({ caller });
  const request = {
    action: "createRecord",
    requestId: "req-retried-create",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.6,
      },
    },
  };

  const first = await api.handle(request);
  const retried = await api.handle(request);

  assert.equal(first.data.replayed, false);
  assert.equal(retried.data.replayed, true);
  assert.equal(first.data.record.id, retried.data.record.id);
  assert.equal(healthItemStore.inspectRecords().length, 1);
});

test("创建记录必须携带 requestId，避免不同保存被误判为重试", async () => {
  const { api } = createApiFor();

  const result = await api.handle({
    action: "createRecord",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T01:20:00.000Z",
      values: {
        temperature: 36.6,
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: undefined,
    error: {
      code: "INVALID_ARGUMENT",
      message: "缺少本次保存的请求编号，请重试",
    },
  });
});

test("使用自定义模板创建记录时保存独立字段快照", async () => {
  const caller = createUser();
  const { api, healthItemStore } = createApiFor({
    caller,
    templates: [
      {
        _id: "template-morning",
        familyId: "family-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "晨间心情",
            type: "short_text",
            required: true,
            status: "active",
            sortOrder: 10,
          },
          {
            key: "field-old",
            label: "旧字段",
            type: "short_text",
            required: false,
            status: "inactive",
            sortOrder: 20,
          },
        ],
      },
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-custom-record",
    data: {
      familyId: "family-1",
      subjectUserId: caller._id,
      sourceTemplateType: "custom",
      sourceTemplateId: "template-morning",
      occurredAt: "2026-07-29T04:10:00.000Z",
      values: {
        "field-mood": "精神很好",
      },
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.sourceTemplateType, "custom");
  assert.equal(saved.sourceTemplateId, "template-morning");
  assert.equal(saved.templateNameSnapshot, "晨间状态");
  assert.deepEqual(saved.fieldSchemaSnapshot, [
    {
      key: "field-mood",
      label: "晨间心情",
      type: "short_text",
      required: true,
      sortOrder: 10,
    },
  ]);
});

test("有效家庭成员可以编辑记录内容但记录结构保持不变", async () => {
  const originalRecord = {
    _id: "record-edit",
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: {
      temperature: 36.6,
    },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-edit",
  };
  const { api, healthItemStore } = createApiFor({
    records: [originalRecord],
    now: new Date("2026-07-29T06:30:00.000Z"),
  });

  const result = await api.handle({
    action: "updateHealthItem",
    requestId: "req-update-record",
    data: {
      recordId: "record-edit",
      expectedRevision: 1,
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 37.1,
      },
      remark: "复测",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.record.revision, 2);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.values.temperature, 37.1);
  assert.equal(saved.remark, "复测");
  assert.deepEqual(
    saved.fieldSchemaSnapshot,
    originalRecord.fieldSchemaSnapshot,
  );
  assert.equal(saved.sourceTemplateId, originalRecord.sourceTemplateId);
  assert.equal(saved.createdAt.getTime(), originalRecord.createdAt.getTime());
});

test("两个成员基于同一版本编辑记录时拒绝后保存的一方", async () => {
  const record = {
    _id: "record-conflict",
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-conflict",
  };
  const { api } = createApiFor({
    records: [record],
    now: new Date("2026-07-29T06:30:00.000Z"),
  });
  const baseRequest = {
    action: "updateHealthItem",
    data: {
      recordId: "record-conflict",
      expectedRevision: 1,
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 37,
      },
    },
  };

  const first = await api.handle({
    ...baseRequest,
    requestId: "req-first-editor",
  });
  const second = await api.handle({
    ...baseRequest,
    requestId: "req-second-editor",
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, {
    ok: false,
    requestId: "req-second-editor",
    error: {
      code: "REVISION_CONFLICT",
      message: "记录已被其他人修改，请刷新后重试",
    },
  });
});

test("记录首次保存后不能更换所属人、模板或字段结构", async () => {
  const record = {
    _id: "record-locked",
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-locked",
  };
  const { api, healthItemStore } = createApiFor({
    records: [record],
  });

  const result = await api.handle({
    action: "updateHealthItem",
    requestId: "req-switch-template",
    data: {
      recordId: "record-locked",
      expectedRevision: 1,
      sourceTemplateId: "sys_blood_glucose",
      occurredAt: "2026-07-29T06:20:00.000Z",
      values: {
        temperature: 36.8,
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-switch-template",
    error: {
      code: "LOCKED_FIELDS_CANNOT_CHANGE",
      message: "记录保存后不能更换所属人、模板或表单结构",
    },
  });
  assert.equal(healthItemStore.inspectRecords()[0].revision, 1);
});

test("记录软删除后不可见并且可以恢复", async () => {
  const record = {
    _id: "record-delete",
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: { temperature: 36.6 },
    occurredAt: new Date("2026-07-29T06:00:00.000Z"),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date("2026-07-29T06:01:00.000Z"),
    updatedAt: new Date("2026-07-29T06:01:00.000Z"),
    originRecordId: "record-delete",
  };
  let now = new Date("2026-07-29T07:00:00.000Z");
  const healthItemStore = createInMemoryHealthItemStore({
    users: [createUser()],
    memberships: [createMembership({ userId: "user-1" })],
    records: [record],
  });
  const api = createHealthItemApi({
    getCaller: async () => createUser(),
    healthItemStore,
    getSystemTemplate,
    createRecordId: () => "unused",
    now: () => now,
  });

  const deleted = await api.handle({
    action: "softDeleteItem",
    requestId: "req-delete-record",
    data: {
      recordId: "record-delete",
      expectedRevision: 1,
    },
  });

  assert.equal(deleted.ok, true);
  assert.equal(deleted.data.record.revision, 2);
  assert.equal(
    deleted.data.record.deletedAt,
    "2026-07-29T07:00:00.000Z",
  );

  const hidden = await api.handle({
    action: "getHealthItem",
    requestId: "req-read-deleted-record",
    data: {
      recordId: "record-delete",
    },
  });
  assert.equal(hidden.ok, false);
  assert.equal(hidden.error.code, "HEALTH_ITEM_NOT_FOUND");

  now = new Date("2026-07-29T07:10:00.000Z");
  const restored = await api.handle({
    action: "restoreItem",
    requestId: "req-restore-record",
    data: {
      recordId: "record-delete",
      expectedRevision: 2,
    },
  });

  assert.equal(restored.ok, true);
  assert.equal(restored.data.record.revision, 3);
  assert.equal(Object.hasOwn(restored.data.record, "deletedAt"), false);

  const visible = await api.handle({
    action: "getHealthItem",
    requestId: "req-read-restored-record",
    data: {
      recordId: "record-delete",
    },
  });
  assert.equal(visible.ok, true);
});

test("自定义单选字段只接受模板中的启用选项", async () => {
  const { api, healthItemStore } = createApiFor({
    templates: [
      {
        _id: "template-mood",
        familyId: "family-1",
        name: "晨间状态",
        status: "active",
        fields: [
          {
            key: "field-mood",
            label: "精神状态",
            type: "single_choice",
            required: true,
            status: "active",
            sortOrder: 10,
            options: [
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
            ],
          },
        ],
      },
    ],
  });

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-choice-record",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateType: "custom",
      sourceTemplateId: "template-mood",
      occurredAt: "2026-07-29T07:30:00.000Z",
      values: {
        "field-mood": "option-good",
      },
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.equal(saved.values["field-mood"], "option-good");
  assert.deepEqual(saved.fieldSchemaSnapshot[0].options, [
    {
      key: "option-good",
      label: "很好",
      sortOrder: 10,
    },
    {
      key: "option-tired",
      label: "疲惫",
      sortOrder: 20,
    },
  ]);
});

test("创建记录时最多可以附加简短临时字段并锁定到快照", async () => {
  const { api, healthItemStore } = createApiFor();

  const result = await api.handle({
    action: "createRecord",
    requestId: "req-create-record-with-temporary-field",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-07-29T08:00:00.000Z",
      values: {
        temperature: 36.7,
      },
      temporaryFields: [
        {
          label: "昨晚睡眠",
          value: "7 小时",
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  const [saved] = healthItemStore.inspectRecords();
  assert.deepEqual(saved.fieldSchemaSnapshot.at(-1), {
    key: "temporary-1",
    label: "昨晚睡眠",
    type: "short_text",
    required: false,
    temporary: true,
    sortOrder: 20,
  });
  assert.equal(saved.values["temporary-1"], "7 小时");
});
