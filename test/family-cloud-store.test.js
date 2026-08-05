const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCloudFamilyStore,
} = require("../cloudfunctions/family-api/src/create-cloud-family-store");
const {
  createInMemoryCloudDatabase,
} = require("./support/create-in-memory-cloud-database");

test("CloudBase 加入家庭事务同时保存成员关系和用户显示名称", async () => {
  const timestamp = new Date("2026-08-05T02:00:00.000Z");
  const db = createInMemoryCloudDatabase({
    users: [
      {
        _id: "user-1",
        wechatOpenId: "openid-1",
        displayName: "微信用户",
        revision: 1,
      },
    ],
    families: [
      {
        _id: "family-1",
        name: "测试家庭",
        revision: 1,
      },
    ],
    family_invites: [
      {
        _id: "invite-1",
        familyId: "family-1",
        status: "active",
        expiresAt: new Date("2026-08-06T02:00:00.000Z"),
        revision: 1,
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.joinFamilyWithInvite({
    inviteQuery: { _id: "invite-1" },
    userId: "user-1",
    displayName: "爸爸",
    profileManagementAllowed: true,
    membershipId: "membership-1",
    timestamp,
  });

  assert.equal(result.user.displayName, "爸爸");
  assert.equal(db.read("users", "user-1").displayName, "爸爸");
  assert.equal(
    db.read("family_memberships", "membership-1").status,
    "active",
  );
  assert.equal(db.read("family_invites", "invite-1").status, "used");
});

test("CloudBase 事务串行处理两名管理员的同时自我降级", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "并发家庭",
        revision: 1,
      },
    ],
    family_memberships: [
      {
        _id: "membership-a",
        familyId: "family-1",
        userId: "admin-a",
        role: "admin",
        status: "active",
        revision: 1,
      },
      {
        _id: "membership-b",
        familyId: "family-1",
        userId: "admin-b",
        role: "admin",
        status: "active",
        revision: 1,
      },
    ],
  });
  const store = createCloudFamilyStore(db);
  const timestamp = new Date("2026-07-31T12:00:00.000Z");

  const results = await Promise.all([
    store.demoteSelfFromAdmin({
      familyId: "family-1",
      userId: "admin-a",
      timestamp,
    }),
    store.demoteSelfFromAdmin({
      familyId: "family-1",
      userId: "admin-b",
      timestamp,
    }),
  ]);

  assert.deepEqual(
    results.map((result) => result.outcome),
    ["updated", "last-admin"],
  );
  assert.equal(
    db
      .list("family_memberships")
      .filter(
        (membership) =>
          membership.status === "active" &&
          membership.role === "admin",
      ).length,
    1,
  );
});

test("CloudBase 事务提升普通成员并推进家庭版本", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "角色家庭",
        revision: 4,
      },
    ],
    family_memberships: [
      {
        _id: "membership-admin",
        familyId: "family-1",
        userId: "admin-user",
        role: "admin",
        status: "active",
        revision: 1,
      },
      {
        _id: "membership-member",
        familyId: "family-1",
        userId: "member-user",
        role: "member",
        status: "active",
        revision: 2,
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.promoteMemberToAdmin({
    familyId: "family-1",
    callerUserId: "admin-user",
    targetUserId: "member-user",
    timestamp: new Date("2026-07-31T12:00:00.000Z"),
  });

  assert.equal(result.outcome, "updated");
  assert.equal(
    db.read("family_memberships", "membership-member").role,
    "admin",
  );
  assert.equal(db.read("families", "family-1").revision, 5);
});

test("CloudBase 成员退出事务暂停本人规则并只清理未来未打卡提醒", async () => {
  const timestamp = new Date("2026-07-31T12:00:00.000Z");
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "清理家庭",
        revision: 1,
      },
    ],
    family_memberships: [
      {
        _id: "membership-admin",
        familyId: "family-1",
        userId: "admin-user",
        role: "admin",
        status: "active",
        revision: 1,
      },
      {
        _id: "membership-member",
        familyId: "family-1",
        userId: "member-user",
        role: "member",
        status: "active",
        revision: 1,
      },
    ],
    recurring_rules: [
      {
        _id: "subject-rule",
        familyId: "family-1",
        subjectUserId: "member-user",
        createdByUserId: "admin-user",
        status: "active",
        revision: 1,
      },
      {
        _id: "creator-rule",
        familyId: "family-1",
        subjectUserId: "admin-user",
        createdByUserId: "member-user",
        status: "active",
        revision: 1,
      },
    ],
    one_time_reminders: [
      {
        _id: "future-pending",
        familyId: "family-1",
        subjectUserId: "member-user",
        sourceRecurringRuleId: "subject-rule",
        status: "pending",
        plannedAt: new Date(timestamp.getTime() + 60_000),
      },
      {
        _id: "past-pending",
        familyId: "family-1",
        subjectUserId: "member-user",
        sourceRecurringRuleId: "subject-rule",
        status: "pending",
        plannedAt: new Date(timestamp.getTime() - 60_000),
      },
      {
        _id: "future-completed",
        familyId: "family-1",
        subjectUserId: "member-user",
        sourceRecurringRuleId: "subject-rule",
        status: "completed",
        plannedAt: new Date(timestamp.getTime() + 60_000),
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.leaveFamily({
    familyId: "family-1",
    userId: "member-user",
    timestamp,
  });

  assert.equal(result.outcome, "updated");
  assert.equal(
    db.read("family_memberships", "membership-member").status,
    "inactive",
  );
  assert.equal(
    db.read("recurring_rules", "subject-rule").pauseReason,
    "subject_inactive",
  );
  assert.equal(
    db.read("recurring_rules", "creator-rule").status,
    "active",
  );
  assert.equal(
    db.read("one_time_reminders", "future-pending"),
    null,
  );
  assert.ok(db.read("one_time_reminders", "past-pending"));
  assert.ok(db.read("one_time_reminders", "future-completed"));
});

test("CloudBase 事务拒绝管理员移除另一名管理员", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "管理员家庭",
        revision: 1,
      },
    ],
    family_memberships: [
      {
        _id: "membership-a",
        familyId: "family-1",
        userId: "admin-a",
        role: "admin",
        status: "active",
        revision: 1,
      },
      {
        _id: "membership-b",
        familyId: "family-1",
        userId: "admin-b",
        role: "admin",
        status: "active",
        revision: 1,
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.removeMember({
    familyId: "family-1",
    callerUserId: "admin-a",
    targetUserId: "admin-b",
    timestamp: new Date("2026-07-31T12:00:00.000Z"),
  });

  assert.deepEqual(result, {
    outcome: "target-admin",
  });
  assert.equal(
    db.read("family_memberships", "membership-b").status,
    "active",
  );
});

test("CloudBase 在同一事务内提升接任者并使唯一管理员退出", async () => {
  const db = createInMemoryCloudDatabase({
    families: [
      {
        _id: "family-1",
        name: "转让家庭",
        revision: 3,
      },
    ],
    family_memberships: [
      {
        _id: "membership-admin",
        familyId: "family-1",
        userId: "admin-user",
        role: "admin",
        status: "active",
        revision: 2,
      },
      {
        _id: "membership-successor",
        familyId: "family-1",
        userId: "successor-user",
        role: "member",
        status: "active",
        revision: 1,
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.transferAdminAndLeave({
    familyId: "family-1",
    userId: "admin-user",
    successorUserId: "successor-user",
    timestamp: new Date("2026-07-31T12:00:00.000Z"),
  });

  assert.equal(result.outcome, "updated");
  assert.equal(
    db.read("family_memberships", "membership-admin").status,
    "inactive",
  );
  assert.equal(
    db.read(
      "family_memberships",
      "membership-successor",
    ).role,
    "admin",
  );
  assert.equal(db.read("families", "family-1").revision, 4);
});

test("CloudBase 解散家庭时永久清理家庭数据但保留全局用户", async () => {
  const db = createInMemoryCloudDatabase({
    users: [
      {
        _id: "admin-user",
        displayName: "管理员",
      },
    ],
    families: [
      {
        _id: "family-1",
        name: "临时家庭",
        revision: 1,
      },
    ],
    family_memberships: [
      {
        _id: "membership-admin",
        familyId: "family-1",
        userId: "admin-user",
        role: "admin",
        status: "active",
      },
    ],
    family_invites: [
      {
        _id: "invite-1",
        familyId: "family-1",
      },
    ],
    health_templates: [
      {
        _id: "template-1",
        familyId: "family-1",
      },
    ],
    health_records: [
      {
        _id: "record-1",
        familyId: "family-1",
      },
    ],
    one_time_reminders: [
      {
        _id: "reminder-1",
        familyId: "family-1",
      },
    ],
    recurring_rules: [
      {
        _id: "rule-1",
        familyId: "family-1",
      },
    ],
    care_shares: [
      {
        _id: "share-1",
        familyId: "family-1",
      },
    ],
  });
  const store = createCloudFamilyStore(db);

  const result = await store.dissolveFamily({
    familyId: "family-1",
    userId: "admin-user",
    confirmationName: "临时家庭",
  });

  assert.deepEqual(result, {
    outcome: "dissolved",
  });
  assert.equal(db.read("families", "family-1"), null);
  assert.equal(db.list("family_memberships").length, 0);
  assert.equal(db.list("family_invites").length, 0);
  assert.equal(db.list("health_templates").length, 0);
  assert.equal(db.list("health_records").length, 0);
  assert.equal(db.list("one_time_reminders").length, 0);
  assert.equal(db.list("recurring_rules").length, 0);
  assert.equal(db.list("care_shares").length, 0);
  assert.ok(db.read("users", "admin-user"));
});
