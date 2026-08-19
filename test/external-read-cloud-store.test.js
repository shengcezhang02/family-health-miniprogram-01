const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCloudExternalReadStore,
} = require("../cloudfunctions/external-access-api/create-cloud-external-read-store");
const {
  createInMemoryCloudDatabase,
} = require("./support/create-in-memory-cloud-database");

test("CloudBase 外部读取上下文只包含有效家庭和有效成员", async () => {
  const db = createInMemoryCloudDatabase({
    users: [
      { _id: "user-1", displayName: "小明" },
      { _id: "user-2", displayName: "妈妈" },
      { _id: "user-left", displayName: "已退出成员" },
    ],
    families: [
      {
        _id: "family-1",
        name: "测试家庭",
        systemTemplateSettings: [],
      },
    ],
    family_memberships: [
      {
        _id: "membership-1",
        familyId: "family-1",
        userId: "user-1",
        role: "admin",
        status: "active",
      },
      {
        _id: "membership-2",
        familyId: "family-1",
        userId: "user-2",
        role: "member",
        status: "active",
      },
      {
        _id: "membership-left",
        familyId: "family-1",
        userId: "user-left",
        role: "member",
        status: "left",
      },
    ],
    health_templates: [
      {
        _id: "template-1",
        familyId: "family-1",
        name: "睡眠",
        status: "active",
        fields: [],
      },
      {
        _id: "template-other",
        familyId: "family-other",
        name: "其他家庭模板",
        status: "active",
        fields: [],
      },
    ],
  });
  const store = createCloudExternalReadStore(db);

  const result = await store.listFamilyContextsByUserId("user-1");

  assert.equal(result.user.displayName, "小明");
  assert.equal(result.familyContexts.length, 1);
  assert.equal(result.familyContexts[0].family.name, "测试家庭");
  assert.equal(result.familyContexts[0].callerMembership._id, "membership-1");
  assert.deepEqual(
    result.familyContexts[0].activeMemberships.map(
      (membership) => membership.userId,
    ),
    ["user-1", "user-2"],
  );
  assert.deepEqual(
    result.familyContexts[0].users.map((user) => user._id),
    ["user-1", "user-2"],
  );
  assert.deepEqual(
    result.familyContexts[0].customTemplates.map(
      (template) => template._id,
    ),
    ["template-1"],
  );
});

test("CloudBase 外部记录查询固定过滤家庭、成员、模板、时间和删除状态", async () => {
  const makeRecord = (id, overrides = {}) => ({
    _id: id,
    familyId: "family-1",
    subjectUserId: "user-2",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    occurredAt: new Date("2026-08-10T00:00:00.000Z"),
    ...overrides,
  });
  const db = createInMemoryCloudDatabase({
    health_records: [
      makeRecord("record-new", {
        occurredAt: new Date("2026-08-12T00:00:00.000Z"),
      }),
      makeRecord("record-old", {
        occurredAt: new Date("2026-08-05T00:00:00.000Z"),
      }),
      makeRecord("record-deleted", {
        occurredAt: new Date("2026-08-11T00:00:00.000Z"),
        deletedAt: new Date("2026-08-12T00:00:00.000Z"),
      }),
      makeRecord("record-other-subject", { subjectUserId: "user-3" }),
      makeRecord("record-other-template", {
        sourceTemplateId: "sys_blood_pressure",
      }),
      makeRecord("record-other-family", { familyId: "family-2" }),
    ],
  });
  const store = createCloudExternalReadStore(db);

  const result = await store.listHealthItems({
    familyId: "family-1",
    itemType: "record",
    subjectUserId: "user-2",
    templateType: "system",
    templateId: "sys_temperature",
    from: new Date("2026-08-01T00:00:00.000Z"),
    to: new Date("2026-08-31T23:59:59.999Z"),
    offset: 0,
    limit: 10,
  });

  assert.deepEqual(
    result.map((record) => record._id),
    ["record-new", "record-old"],
  );
});

test("CloudBase 周期规则按与查询日期范围相交筛选", async () => {
  const makeRule = (id, startDate, endDate) => ({
    _id: id,
    familyId: "family-1",
    subjectUserId: "user-1",
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    startDate,
    endDate,
  });
  const db = createInMemoryCloudDatabase({
    recurring_rules: [
      makeRule("rule-overlap", "2026-08-01", "2026-08-31"),
      makeRule("rule-ended", "2026-07-01", "2026-07-31"),
      makeRule("rule-future", "2026-09-01", "2026-09-30"),
    ],
  });
  const store = createCloudExternalReadStore(db);

  const result = await store.listHealthItems({
    familyId: "family-1",
    itemType: "recurring_rule",
    from: new Date("2026-08-10T00:00:00.000Z"),
    to: new Date("2026-08-12T23:59:59.999Z"),
    offset: 0,
    limit: 10,
  });

  assert.deepEqual(
    result.map((rule) => rule._id),
    ["rule-overlap"],
  );
});

test("CloudBase 只给当前用户的有效家庭成员关系写入告知确认", async () => {
  const db = createInMemoryCloudDatabase({
    family_memberships: [
      {
        _id: "membership-active-1",
        familyId: "family-1",
        userId: "user-1",
        status: "active",
        revision: 2,
      },
      {
        _id: "membership-active-2",
        familyId: "family-2",
        userId: "user-1",
        status: "active",
        revision: 1,
      },
      {
        _id: "membership-left",
        familyId: "family-old",
        userId: "user-1",
        status: "left",
        revision: 3,
      },
      {
        _id: "membership-other",
        familyId: "family-1",
        userId: "user-2",
        status: "active",
        revision: 1,
      },
    ],
  });
  const store = createCloudExternalReadStore(db);
  const acceptedAt = new Date("2026-08-19T05:00:00.000Z");

  const result = await store.acceptExternalAccessNotice({
    userId: "user-1",
    noticeVersion: "experimental_full_family_health_v1",
    acceptedAt,
  });

  assert.deepEqual(result, { updatedCount: 2 });
  for (const membershipId of [
    "membership-active-1",
    "membership-active-2",
  ]) {
    const membership = db.read("family_memberships", membershipId);
    assert.equal(
      membership.externalAccessNoticeVersion,
      "experimental_full_family_health_v1",
    );
    assert.deepEqual(
      membership.externalAccessNoticeAcceptedAt,
      acceptedAt,
    );
  }
  assert.equal(
    db.read("family_memberships", "membership-left")
      .externalAccessNoticeVersion,
    undefined,
  );
  assert.equal(
    db.read("family_memberships", "membership-other")
      .externalAccessNoticeVersion,
    undefined,
  );
});

test("CloudBase 在事务内按家庭版本更新系统模板设置", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "测试家庭",
        revision: 3,
        systemTemplateSettings: [
          {
            templateId: "sys_temperature",
            status: "active",
            sortOrder: 10,
          },
        ],
      },
    ],
    family_memberships: [
      {
        _id: "membership-1",
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
  });
  const store = createCloudExternalReadStore(db);
  const updatedAt = new Date("2026-08-19T06:00:00.000Z");

  const result = await store.updateSystemTemplateSettings({
    actorUserId: "user-1",
    familyId: "family-1",
    systemTemplateId: "sys_temperature",
    expectedRevision: 3,
    status: "inactive",
    sortOrder: 25,
    updatedAt,
  });

  assert.deepEqual(result, {
    outcome: "updated",
    familyRevision: 4,
    setting: {
      templateId: "sys_temperature",
      status: "inactive",
      sortOrder: 25,
    },
  });
  assert.deepEqual(
    db.read("families", "family-1").systemTemplateSettings,
    [
      {
        templateId: "sys_temperature",
        status: "inactive",
        sortOrder: 25,
      },
    ],
  );
  assert.equal(db.read("families", "family-1").revision, 4);
  assert.equal(
    db.read("families", "family-1").updatedByUserId,
    "user-1",
  );
});

test("CloudBase 系统模板设置拒绝非成员和过期家庭版本", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        revision: 2,
        systemTemplateSettings: [],
      },
    ],
    family_memberships: [
      {
        _id: "membership-1",
        familyId: "family-1",
        userId: "user-1",
        status: "active",
      },
    ],
  });
  const store = createCloudExternalReadStore(db);

  assert.equal(
    (
      await store.updateSystemTemplateSettings({
        actorUserId: "user-other",
        familyId: "family-1",
        systemTemplateId: "sys_temperature",
        expectedRevision: 2,
        status: "active",
        sortOrder: 10,
      })
    ).outcome,
    "permission-denied",
  );
  assert.equal(
    (
      await store.updateSystemTemplateSettings({
        actorUserId: "user-1",
        familyId: "family-1",
        systemTemplateId: "sys_temperature",
        expectedRevision: 1,
        status: "active",
        sortOrder: 10,
      })
    ).outcome,
    "revision-conflict",
  );
  assert.equal(db.read("families", "family-1").revision, 2);
});
