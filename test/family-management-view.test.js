const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFamilyManagementView,
} = require("../miniprogram/services/family-management-view");

test("普通成员只看到退出家庭，不会看到管理员操作", () => {
  const view = buildFamilyManagementView({
    family: {
      id: "family-1",
      name: "测试家庭",
      role: "member",
    },
    currentUserId: "member-a",
    members: [
      {
        id: "member-a",
        displayName: "成员 A",
        role: "member",
        isSelf: true,
      },
      {
        id: "member-b",
        displayName: "成员 B",
        role: "member",
        isSelf: false,
      },
    ],
  });

  assert.equal(view.canInvite, false);
  assert.equal(view.canDissolve, false);
  assert.equal(view.canDemoteSelf, false);
  assert.equal(view.mustTransferBeforeLeaving, false);
  assert.equal(view.canLeaveDirectly, true);
  assert.equal(view.members[1].canPromote, false);
  assert.equal(view.members[1].canRemove, false);
});

test("管理员只能提升或移除普通成员，不能操作另一名管理员", () => {
  const view = buildFamilyManagementView({
    family: {
      id: "family-1",
      name: "测试家庭",
      role: "admin",
    },
    currentUserId: "admin-a",
    members: [
      {
        id: "admin-a",
        displayName: "管理员 A",
        role: "admin",
        isSelf: true,
      },
      {
        id: "admin-b",
        displayName: "管理员 B",
        role: "admin",
        isSelf: false,
      },
      {
        id: "member-a",
        displayName: "成员 A",
        role: "member",
        isSelf: false,
      },
    ],
  });

  assert.equal(view.canInvite, true);
  assert.equal(view.canDissolve, true);
  assert.equal(view.canDemoteSelf, true);
  assert.equal(view.canLeaveDirectly, true);
  assert.equal(view.members[1].canPromote, false);
  assert.equal(view.members[1].canRemove, false);
  assert.equal(view.members[2].canPromote, true);
  assert.equal(view.members[2].canRemove, true);
});

test("唯一管理员退出前必须选择另一名有效成员接任", () => {
  const view = buildFamilyManagementView({
    family: {
      id: "family-1",
      name: "测试家庭",
      role: "admin",
    },
    currentUserId: "admin-a",
    members: [
      {
        id: "admin-a",
        displayName: "管理员 A",
        role: "admin",
        isSelf: true,
      },
      {
        id: "member-a",
        displayName: "成员 A",
        role: "member",
        isSelf: false,
      },
    ],
  });

  assert.equal(view.canDemoteSelf, false);
  assert.equal(view.mustTransferBeforeLeaving, true);
  assert.equal(view.canLeaveDirectly, false);
  assert.deepEqual(
    view.successorOptions.map((member) => member.id),
    ["member-a"],
  );
});
