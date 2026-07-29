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
  records = [],
  now = new Date("2026-07-29T01:30:00.000Z"),
  createRecordId = () => "record-1",
} = {}) {
  const healthItemStore = createInMemoryHealthItemStore({
    users: caller === subject ? [caller] : [caller, subject],
    memberships,
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
