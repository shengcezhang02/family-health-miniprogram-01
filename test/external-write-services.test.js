const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const {
  createExternalWriteServices,
} = require("../packages/family-health-business/create-external-write-services");
const {
  createHealthItemApi,
} = require("../cloudfunctions/health-item-api/src/create-health-item-api");
const {
  getSystemTemplate,
} = require("../cloudfunctions/health-item-api/src/system-templates");
const {
  createTemplateApi,
} = require("../cloudfunctions/template-api/src/create-template-api");
const {
  createInMemoryHealthItemStore,
} = require("./support/create-in-memory-health-item-store");
const {
  createInMemoryTemplateStore,
} = require("./support/create-in-memory-template-store");

function stableId(kind, userId, requestId) {
  return `${kind}-${createHash("sha256")
    .update(`${userId}\n${requestId}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function createServices() {
  const memberships = [
      {
        _id: "membership-1",
        familyId: "family-1",
        userId: "user-1",
        status: "active",
        role: "member",
      },
      {
        _id: "membership-2",
        familyId: "family-1",
        userId: "user-2",
        status: "active",
        role: "member",
      },
    ];
  const healthItemStore = createInMemoryHealthItemStore({
    memberships,
  });
  const templateStore = createInMemoryTemplateStore({
    memberships,
  });
  let family = {
    _id: "family-1",
    revision: 1,
    systemTemplateSettings: [],
  };
  const systemTemplateStore = {
    async updateSystemTemplateSettings({
      actorUserId,
      familyId,
      systemTemplateId,
      expectedRevision,
      status,
      sortOrder,
    }) {
      const membership = memberships.find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === actorUserId &&
          candidate.status === "active",
      );

      if (!membership) {
        return { outcome: "permission-denied" };
      }

      if (family._id !== familyId) {
        return { outcome: "not-found" };
      }

      if (family.revision !== expectedRevision) {
        return { outcome: "revision-conflict" };
      }

      const setting = { templateId: systemTemplateId, status, sortOrder };
      family = {
        ...family,
        revision: family.revision + 1,
        systemTemplateSettings: [setting],
      };
      return {
        outcome: "updated",
        familyRevision: family.revision,
        setting,
      };
    },
    inspectFamily() {
      return structuredClone(family);
    },
  };
  const services = createExternalWriteServices({
    getSystemTemplate,
    systemTemplateStore,
    createHealthItemApiForActor: (actor) =>
      createHealthItemApi({
        getCaller: async () => ({ _id: actor.userId }),
        healthItemStore,
        getSystemTemplate,
        createRecordId: ({ callerUserId, requestId }) =>
          stableId("record", callerUserId, requestId),
        createReminderId: ({ callerUserId, requestId }) =>
          stableId("reminder", callerUserId, requestId),
        createRuleId: ({ callerUserId, requestId }) =>
          stableId("rule", callerUserId, requestId),
        createCheckInRecordId: ({ reminderId }) =>
          stableId("record-check-in", actor.userId, reminderId),
        getMutationContext: async () => ({
          via: "external_api",
          externalTokenId: actor.externalTokenId,
        }),
        now: () => new Date("2026-08-19T02:00:00.000Z"),
      }),
    createTemplateApiForActor: (actor) =>
      createTemplateApi({
        getCaller: async () => ({ _id: actor.userId }),
        templateStore,
        createId: (kind, { callerUserId, requestId }) =>
          stableId(kind, callerUserId, requestId),
        getMutationContext: async () => ({
          via: "external_api",
          externalTokenId: actor.externalTokenId,
        }),
        now: () => new Date("2026-08-19T02:00:00.000Z"),
      }),
  });

  return {
    services,
    healthItemStore,
    templateStore,
    systemTemplateStore,
  };
}

test("外部令牌复用现有业务规则为同家庭成员创建健康记录", async () => {
  const { services, healthItemStore } = createServices();

  const result = await services.healthItems(
    {
      action: "createRecord",
      requestId: "agent-create-temperature-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateType: "system",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-08-19T01:30:00.000Z",
        values: {
          temperature: 36.7,
        },
        remark: "AI 代为录入",
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-1",
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.record.subjectUserId, "user-2");
  assert.equal(result.data.record.values.temperature, 36.7);
  const [storedRecord] = healthItemStore.inspectRecords();
  assert.equal(storedRecord.createdVia, "external_api");
  assert.equal(storedRecord.createdByExternalTokenId, "token-1");
  assert.equal(storedRecord.updatedVia, "external_api");
  assert.equal(storedRecord.updatedByExternalTokenId, "token-1");
});

test("外部令牌使用统一事项编号和版本修改健康记录", async () => {
  const { services, healthItemStore } = createServices();
  const actor = {
    userId: "user-1",
    externalTokenId: "token-1",
  };
  const created = await services.healthItems(
    {
      action: "createRecord",
      requestId: "agent-create-before-update-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-08-19T01:30:00.000Z",
        values: { temperature: 36.7 },
      },
    },
    actor,
  );

  const result = await services.healthItems(
    {
      action: "updateHealthItem",
      requestId: "agent-update-temperature-001",
      data: {
        itemType: "record",
        itemId: created.data.record.id,
        expectedRevision: 1,
        occurredAt: "2026-08-19T01:40:00.000Z",
        values: { temperature: 36.8 },
        remark: "复测",
      },
    },
    {
      ...actor,
      externalTokenId: "token-2",
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.record.values.temperature, 36.8);
  assert.equal(result.data.record.revision, 2);
  assert.equal(
    healthItemStore.inspectRecords()[0].updatedByExternalTokenId,
    "token-2",
  );
});

test("外部令牌创建并打卡一次性提醒且保留外部令牌审计", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createReminder",
      requestId: "agent-create-reminder-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        plannedAt: "2026-08-19T03:00:00.000Z",
        notificationTimes: ["2026-08-19T02:50:00.000Z"],
        values: {},
        remark: "晚间测量",
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-1",
    },
  );
  const checkedIn = await services.healthItems(
    {
      action: "checkInReminder",
      requestId: "agent-check-in-reminder-001",
      data: {
        itemType: "reminder",
        itemId: created.data.reminder.id,
        expectedRevision: 1,
        occurredAt: "2026-08-19T02:58:00.000Z",
        values: { temperature: 36.6 },
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-2",
    },
  );

  assert.equal(checkedIn.ok, true, JSON.stringify(checkedIn));
  assert.equal(checkedIn.data.reminder.status, "completed");
  assert.equal(checkedIn.data.record.values.temperature, 36.6);
  const [storedReminder] = healthItemStore.inspectReminders();
  const [storedRecord] = healthItemStore.inspectRecords();
  assert.equal(storedReminder.createdByExternalTokenId, "token-1");
  assert.equal(storedReminder.updatedByExternalTokenId, "token-2");
  assert.equal(storedRecord.createdByExternalTokenId, "token-2");
});

test("外部令牌按版本修改一次性提醒并记录最新外部令牌", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createReminder",
      requestId: "agent-create-reminder-before-update-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        plannedAt: "2026-08-19T03:00:00.000Z",
        notificationTimes: [],
        values: {},
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );
  const result = await services.healthItems(
    {
      action: "updateHealthItem",
      requestId: "agent-update-reminder-001",
      data: {
        itemType: "reminder",
        itemId: created.data.reminder.id,
        expectedRevision: 1,
        plannedAt: "2026-08-19T04:00:00.000Z",
        notificationTimes: ["2026-08-19T03:50:00.000Z"],
        values: {},
        remark: "推迟一小时",
      },
    },
    { userId: "user-1", externalTokenId: "token-2" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.reminder.revision, 2);
  assert.equal(
    healthItemStore.inspectReminders()[0].updatedByExternalTokenId,
    "token-2",
  );
});

test("外部令牌创建、暂停和恢复周期规则并保留最新令牌审计", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createRecurringRule",
      requestId: "agent-create-rule-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        values: {},
        startDate: "2026-08-19",
        endDate: "2026-08-31",
        repeat: { type: "daily" },
        dailyTimes: ["08:00"],
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-1",
    },
  );
  const paused = await services.healthItems(
    {
      action: "pauseRule",
      requestId: "agent-pause-rule-001",
      data: {
        itemType: "recurring_rule",
        itemId: created.data.rule.id,
        expectedRevision: 1,
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-2",
    },
  );
  const resumed = await services.healthItems(
    {
      action: "resumeRule",
      requestId: "agent-resume-rule-001",
      data: {
        itemType: "recurring_rule",
        itemId: created.data.rule.id,
        expectedRevision: 2,
      },
    },
    {
      userId: "user-1",
      externalTokenId: "token-3",
    },
  );

  assert.equal(paused.ok, true, JSON.stringify(paused));
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(resumed.data.rule.status, "active");
  const [storedRule] = healthItemStore.inspectRecurringRules();
  assert.equal(storedRule.createdByExternalTokenId, "token-1");
  assert.equal(storedRule.updatedByExternalTokenId, "token-3");
});

test("外部令牌按版本修改周期规则并记录最新外部令牌", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createRecurringRule",
      requestId: "agent-create-rule-before-update-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        values: {},
        startDate: "2026-08-19",
        endDate: "2026-08-31",
        repeat: { type: "daily" },
        dailyTimes: ["08:00"],
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );
  const result = await services.healthItems(
    {
      action: "updateHealthItem",
      requestId: "agent-update-rule-001",
      data: {
        itemType: "recurring_rule",
        itemId: created.data.rule.id,
        expectedRevision: 1,
        values: {},
        remark: "工作日测量",
        startDate: "2026-08-20",
        endDate: "2026-08-31",
        repeat: { type: "weekly", weekdays: [1, 2, 3, 4, 5] },
        dailyTimes: ["09:00"],
      },
    },
    { userId: "user-1", externalTokenId: "token-2" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.rule.revision, 2);
  assert.equal(
    healthItemStore.inspectRecurringRules()[0].updatedByExternalTokenId,
    "token-2",
  );
});

test("外部令牌删除健康事项只执行软删除并记录外部令牌", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createRecord",
      requestId: "agent-create-before-delete-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-08-19T01:30:00.000Z",
        values: { temperature: 36.7 },
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );
  const result = await services.healthItems(
    {
      action: "softDeleteItem",
      requestId: "agent-delete-record-001",
      data: {
        itemType: "record",
        itemId: created.data.record.id,
        expectedRevision: 1,
      },
    },
    { userId: "user-1", externalTokenId: "token-2" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.data.record.deletedAt);
  const [storedRecord] = healthItemStore.inspectRecords();
  assert.ok(storedRecord.deletedAt instanceof Date);
  assert.equal(storedRecord.updatedByExternalTokenId, "token-2");
});

test("外部令牌可以把一次性提醒软删除但不能永久删除", async () => {
  const { services, healthItemStore } = createServices();
  const created = await services.healthItems(
    {
      action: "createReminder",
      requestId: "agent-create-reminder-before-delete-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        plannedAt: "2026-08-19T03:00:00.000Z",
        notificationTimes: [],
        values: {},
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );
  const result = await services.healthItems(
    {
      action: "softDeleteItem",
      requestId: "agent-delete-reminder-001",
      data: {
        itemType: "reminder",
        itemId: created.data.reminder.id,
        expectedRevision: 1,
      },
    },
    { userId: "user-1", externalTokenId: "token-2" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.data.reminder.deletedAt);
  const [storedReminder] = healthItemStore.inspectReminders();
  assert.ok(storedReminder.deletedAt instanceof Date);
  assert.equal(storedReminder.updatedByExternalTokenId, "token-2");
});

test("外部写入把内部家庭权限错误收敛为稳定公网错误码", async () => {
  const { services } = createServices();
  const result = await services.healthItems(
    {
      action: "createRecord",
      requestId: "agent-create-foreign-family-001",
      data: {
        familyId: "family-foreign",
        subjectUserId: "user-2",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-08-19T01:30:00.000Z",
        values: { temperature: 36.7 },
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "FAMILY_ACCESS_DENIED");
});

test("外部令牌创建家庭自定义模板并保留外部令牌审计", async () => {
  const { services, templateStore } = createServices();
  const result = await services.templates(
    {
      action: "createCustomTemplate",
      requestId: "agent-create-template-001",
      data: {
        familyId: "family-1",
        name: "血氧",
        colorKey: "blue",
        fields: [
          {
            label: "血氧饱和度",
            type: "number",
            unit: "%",
            required: true,
          },
        ],
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.template.name, "血氧");
  const [storedTemplate] = templateStore.inspectTemplates();
  assert.equal(storedTemplate.createdByExternalTokenId, "token-1");
  assert.equal(storedTemplate.updatedByExternalTokenId, "token-1");
});

test("外部令牌按版本修改并停用自定义模板而不永久删除", async () => {
  const { services, templateStore } = createServices();
  const created = await services.templates(
    {
      action: "createCustomTemplate",
      requestId: "agent-create-template-before-update-001",
      data: {
        familyId: "family-1",
        name: "血氧",
        colorKey: "blue",
        fields: [
          {
            label: "血氧饱和度",
            type: "number",
            unit: "%",
            required: true,
          },
        ],
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );
  const updated = await services.templates(
    {
      action: "updateCustomTemplate",
      requestId: "agent-update-template-001",
      data: {
        familyId: "family-1",
        templateId: created.data.template.id,
        expectedRevision: 1,
        name: "指夹血氧",
        colorKey: "teal",
        fields: created.data.template.fields,
      },
    },
    { userId: "user-1", externalTokenId: "token-2" },
  );
  const disabled = await services.templates(
    {
      action: "setTemplateStatus",
      requestId: "agent-disable-template-001",
      data: {
        familyId: "family-1",
        templateId: created.data.template.id,
        expectedRevision: 2,
        status: "inactive",
      },
    },
    { userId: "user-1", externalTokenId: "token-3" },
  );

  assert.equal(updated.ok, true, JSON.stringify(updated));
  assert.equal(disabled.ok, true, JSON.stringify(disabled));
  assert.equal(disabled.data.template.status, "inactive");
  const [storedTemplate] = templateStore.inspectTemplates();
  assert.equal(storedTemplate.updatedByExternalTokenId, "token-3");
});

test("外部令牌可以把系统模板复制为家庭自定义模板", async () => {
  const { services, templateStore } = createServices();
  const result = await services.templates(
    {
      action: "copySystemTemplate",
      requestId: "agent-copy-blood-pressure-001",
      data: {
        familyId: "family-1",
        systemTemplateId: "sys_blood_pressure",
        name: "居家血压",
        colorKey: "rose",
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.template.name, "居家血压");
  assert.deepEqual(
    result.data.template.fields.map((field) => field.label),
    ["收缩压", "舒张压"],
  );
  assert.equal(templateStore.inspectTemplates().length, 1);
});

test("外部令牌按家庭版本修改系统模板启用状态和排序", async () => {
  const { services, systemTemplateStore } = createServices();
  const result = await services.templates(
    {
      action: "updateSystemTemplateSettings",
      requestId: "agent-update-system-template-001",
      data: {
        familyId: "family-1",
        systemTemplateId: "sys_temperature",
        expectedRevision: 1,
        status: "inactive",
        sortOrder: 50,
      },
    },
    { userId: "user-1", externalTokenId: "token-1" },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.familyRevision, 2);
  assert.deepEqual(
    systemTemplateStore.inspectFamily().systemTemplateSettings,
    [
      {
        templateId: "sys_temperature",
        status: "inactive",
        sortOrder: 50,
      },
    ],
  );
});

test("外部写入拒绝审计字段和回收站字段注入", async () => {
  const { services, healthItemStore, templateStore } = createServices();
  const actor = { userId: "user-1", externalTokenId: "token-1" };

  const recordResult = await services.healthItems(
    {
      action: "createRecord",
      requestId: "agent-inject-record-001",
      data: {
        familyId: "family-1",
        subjectUserId: "user-1",
        sourceTemplateId: "sys_temperature",
        occurredAt: "2026-08-19T01:30:00.000Z",
        values: { temperature: 36.7 },
        createdByExternalTokenId: "forged-token",
        deletedAt: "2026-08-19T01:31:00.000Z",
      },
    },
    actor,
  );
  const templateResult = await services.templates(
    {
      action: "createCustomTemplate",
      requestId: "agent-inject-template-001",
      data: {
        familyId: "family-1",
        name: "恶意模板",
        fields: [],
        includeDeleted: true,
      },
    },
    actor,
  );

  assert.equal(recordResult.ok, false);
  assert.equal(recordResult.error.code, "INVALID_VALUES");
  assert.equal(templateResult.ok, false);
  assert.equal(templateResult.error.code, "INVALID_VALUES");
  assert.equal(healthItemStore.inspectRecords().length, 0);
  assert.equal(templateStore.inspectTemplates().length, 0);
});

test("外部创建请求重试不会生成重复健康记录", async () => {
  const { services, healthItemStore } = createServices();
  const request = {
    action: "createRecord",
    requestId: "agent-idempotent-record-001",
    data: {
      familyId: "family-1",
      subjectUserId: "user-1",
      sourceTemplateId: "sys_temperature",
      occurredAt: "2026-08-19T01:30:00.000Z",
      values: { temperature: 36.7 },
    },
  };
  const actor = { userId: "user-1", externalTokenId: "token-1" };

  const first = await services.healthItems(request, actor);
  const replay = await services.healthItems(request, actor);

  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(replay.ok, true, JSON.stringify(replay));
  assert.equal(first.data.record.id, replay.data.record.id);
  assert.equal(replay.data.replayed, true);
  assert.equal(healthItemStore.inspectRecords().length, 1);
});
