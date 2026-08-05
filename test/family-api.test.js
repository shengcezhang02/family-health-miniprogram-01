const test = require("node:test");
const assert = require("node:assert/strict");

const { createFamilyApi } = require("../cloudfunctions/family-api/src/create-family-api");
const {
  createInMemoryFamilyStore,
} = require("./support/create-in-memory-family-store");

function createFamilyScenario() {
  const familyStore = createInMemoryFamilyStore();
  let currentOpenId = "admin-openid";
  let nextId = 0;
  let nextInvite = 0;
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: currentOpenId,
    }),
    familyStore,
    createId: () => `scenario-id-${++nextId}`,
    now: () => new Date("2026-07-31T12:00:00.000Z"),
    createInviteCredentials: () => {
      const inviteNumber = ++nextInvite;

      return {
        token: `scenario-token-${inviteNumber}`,
        shortCode: `SC${String(inviteNumber).padStart(4, "0")}`,
        tokenHash: `scenario-token-hash-${inviteNumber}`,
        shortCodeHash: `scenario-short-code-hash-${inviteNumber}`,
      };
    },
    hashInviteToken: (token) =>
      token.replace("scenario-token-", "scenario-token-hash-"),
    hashInviteShortCode: (shortCode) =>
      shortCode.replace("SC", "scenario-short-code-hash-"),
  });

  return {
    api,
    familyStore,
    useUser(openId) {
      currentOpenId = openId;
    },
    async createFamily(name = "M8 测试家庭") {
      const result = await api.handle({
        action: "createFamily",
        requestId: `req-create-${name}`,
        data: {
          name,
        },
      });

      return result.data.family;
    },
    async joinMember(familyId, openId, displayName) {
      const invite = await api.handle({
        action: "createInvite",
        requestId: `req-invite-${openId}`,
        data: {
          familyId,
        },
      });
      currentOpenId = openId;
      const joined = await api.handle({
        action: "joinFamily",
        requestId: `req-join-${openId}`,
        data: {
          token: invite.data.invite.token,
          profileManagementAllowed: true,
          ...(displayName ? { displayName } : {}),
        },
      });
      const bootstrapped = await api.handle({
        action: "bootstrap",
        requestId: `req-bootstrap-${openId}`,
      });

      return {
        family: joined.data.family,
        user: bootstrapped.data.user,
      };
    },
  };
}

test("不支持的 action 返回稳定的 UNSUPPORTED_ACTION 错误", async () => {
  const api = createFamilyApi();

  const result = await api.handle({
    action: "deleteEverything",
    requestId: "req-unsupported-action",
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-unsupported-action",
    error: {
      code: "UNSUPPORTED_ACTION",
      message: "暂不支持这个操作",
    },
  });
});

test("bootstrap 返回统一成功结构且不暴露微信 openid", async () => {
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "trusted-openid",
    }),
    familyStore: createInMemoryFamilyStore(),
    createId: () => "user-bootstrap",
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  const result = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap",
  });

  assert.equal(result.ok, true);
  assert.equal(result.requestId, "req-bootstrap");
  assert.equal(result.data.authenticated, true);
  assert.equal("openId" in result.data, false);
});

test("同一微信身份重复 bootstrap 只得到同一个内部用户", async () => {
  const familyStore = createInMemoryFamilyStore();
  let nextId = 0;
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "same-trusted-openid",
    }),
    familyStore,
    createId: () => `generated-id-${++nextId}`,
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  const first = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-first",
  });
  const second = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-second",
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.data.user.id, "generated-id-1");
  assert.equal(second.data.user.id, first.data.user.id);
  assert.deepEqual(first.data.families, []);
  assert.deepEqual(second.data.families, []);
  assert.equal(nextId, 1);
  assert.equal("wechatOpenId" in first.data.user, false);
});

test("创建家庭会同时建立创建者的有效管理员成员关系", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "family-creator-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  const created = await api.handle({
    action: "createFamily",
    requestId: "req-create-family",
    data: {
      name: " 测试家庭 A ",
    },
  });
  const listed = await api.handle({
    action: "listMyFamilies",
    requestId: "req-list-families",
  });

  assert.deepEqual(created, {
    ok: true,
    requestId: "req-create-family",
    data: {
      family: {
        id: "family-1",
        name: "测试家庭 A",
        role: "admin",
      },
    },
  });
  assert.deepEqual(listed.data.families, [created.data.family]);
});

test("创建家庭提交失败时不会留下可见的无管理员家庭", async () => {
  const familyStore = createInMemoryFamilyStore({
    beforeFamilyCommit: async () => {
      throw new Error("simulated transaction failure");
    },
  });
  const ids = ["user-1", "family-1", "membership-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "failed-family-creator-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  const created = await api.handle({
    action: "createFamily",
    requestId: "req-create-family-failed",
    data: {
      name: "不会残留的家庭",
    },
  });
  const listed = await api.handle({
    action: "listMyFamilies",
    requestId: "req-list-after-failure",
  });

  assert.equal(created.ok, false);
  assert.equal(created.error.code, "INTERNAL_ERROR");
  assert.deepEqual(listed.data.families, []);
});

test("个人空间复用家庭模型并由创建者担任管理员", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "personal-family-1", "personal-membership-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "personal-space-owner-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  const created = await api.handle({
    action: "createPersonalSpace",
    requestId: "req-create-personal-space",
  });
  const listed = await api.handle({
    action: "listMyFamilies",
    requestId: "req-list-personal-space",
  });

  assert.deepEqual(created, {
    ok: true,
    requestId: "req-create-personal-space",
    data: {
      family: {
        id: "personal-family-1",
        name: "我的健康",
        role: "admin",
      },
    },
  });
  assert.deepEqual(listed.data.families, [created.data.family]);
});

test("家庭列表不会返回已经失效的成员关系", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "inactive-membership-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });

  await api.handle({
    action: "createFamily",
    requestId: "req-create-before-inactive",
    data: {
      name: "已经退出的家庭",
    },
  });
  await familyStore.setMembershipStatusForTest("membership-1", "inactive");

  const listed = await api.handle({
    action: "listMyFamilies",
    requestId: "req-list-after-inactive",
  });

  assert.deepEqual(listed.data.families, []);
});

test("家庭管理员可以创建一份有有效期的单次邀请", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1", "invite-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "invite-admin-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
    createInviteCredentials: () => ({
      token: "raw-token-1",
      shortCode: "AB12CD",
      tokenHash: "token-hash-1",
      shortCodeHash: "short-code-hash-1",
    }),
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-invite",
    data: {
      name: "邀请测试家庭",
    },
  });

  const result = await api.handle({
    action: "createInvite",
    requestId: "req-create-invite",
    data: {
      familyId: family.data.family.id,
    },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-create-invite",
    data: {
      invite: {
        id: "invite-1",
        token: "raw-token-1",
        shortCode: "AB12CD",
        expiresAt: "2026-08-04T09:00:00.000Z",
      },
    },
  });
});

test("普通家庭成员不能创建邀请", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "invite-member-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-member",
    data: {
      name: "普通成员家庭",
    },
  });
  await familyStore.setMembershipRoleForTest("membership-1", "member");

  const result = await api.handle({
    action: "createInvite",
    requestId: "req-member-create-invite",
    data: {
      familyId: family.data.family.id,
      role: "admin",
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-member-create-invite",
    error: {
      code: "ADMIN_REQUIRED",
      message: "只有家庭管理员可以创建邀请",
    },
  });
});

test("解析有效邀请只返回加入页需要的最小信息且不消耗邀请", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1", "invite-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "invite-resolver-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
    createInviteCredentials: () => ({
      token: "raw-token-1",
      shortCode: "AB12CD",
      tokenHash: "token-hash-1",
      shortCodeHash: "short-code-hash-1",
    }),
    hashInviteToken: (token) =>
      token === "raw-token-1" ? "token-hash-1" : "unknown-token-hash",
    hashInviteShortCode: (shortCode) =>
      shortCode.toUpperCase() === "AB12CD"
        ? "short-code-hash-1"
        : "unknown-short-code-hash",
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-resolve",
    data: {
      name: "只展示名称的家庭",
    },
  });
  await api.handle({
    action: "createInvite",
    requestId: "req-invite-for-resolve",
    data: {
      familyId: family.data.family.id,
    },
  });

  const first = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-invite-first",
    data: {
      token: "raw-token-1",
    },
  });
  const second = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-invite-second",
    data: {
      token: "raw-token-1",
    },
  });
  const resolvedByShortCode = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-by-short-code",
    data: {
      shortCode: "ab12cd",
    },
  });

  assert.deepEqual(first.data, {
    invite: {
      familyName: "只展示名称的家庭",
      invitedByDisplayName: "微信用户",
      expiresAt: "2026-08-04T09:00:00.000Z",
    },
  });
  assert.deepEqual(second.data, first.data);
  assert.deepEqual(resolvedByShortCode.data, first.data);
});

test("使用邀请会建立唯一成员关系并在同一事务消费邀请", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = [
    "creator-user",
    "family-1",
    "creator-membership",
    "invite-1",
    "invitee-user",
    "invitee-membership",
  ];
  let currentOpenId = "creator-openid";
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: currentOpenId,
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
    createInviteCredentials: () => ({
      token: "join-token-1",
      shortCode: "EF34GH",
      tokenHash: "join-token-hash-1",
      shortCodeHash: "join-short-code-hash-1",
    }),
    hashInviteToken: (token) =>
      token === "join-token-1"
        ? "join-token-hash-1"
        : "unknown-token-hash",
    hashInviteShortCode: (shortCode) =>
      shortCode.toUpperCase() === "EF34GH"
        ? "join-short-code-hash-1"
        : "unknown-short-code-hash",
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-join",
    data: {
      name: "一起加入的家庭",
    },
  });
  await api.handle({
    action: "createInvite",
    requestId: "req-invite-for-join",
    data: {
      familyId: family.data.family.id,
    },
  });

  currentOpenId = "invitee-openid";
  const joined = await api.handle({
    action: "joinFamily",
    requestId: "req-join-family",
    data: {
      shortCode: "ef34gh",
      profileManagementAllowed: true,
    },
  });
  const joinedAgain = await api.handle({
    action: "joinFamily",
    requestId: "req-join-family-again",
    data: {
      shortCode: "EF34GH",
      profileManagementAllowed: true,
    },
  });
  const bootstrapped = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-after-join",
  });
  const resolvedAfterUse = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-after-use",
    data: {
      token: "join-token-1",
    },
  });

  assert.deepEqual(joined, {
    ok: true,
    requestId: "req-join-family",
    data: {
      family: {
        id: "family-1",
        name: "一起加入的家庭",
        role: "member",
      },
      profileManagementAllowed: true,
    },
  });
  assert.deepEqual(bootstrapped.data.families, [joined.data.family]);
  assert.deepEqual(joinedAgain.data, joined.data);
  assert.equal(resolvedAfterUse.ok, false);
  assert.equal(resolvedAfterUse.error.code, "INVITE_UNAVAILABLE");
});

test("加入家庭必须明确提交档案代管选择", async () => {
  const api = createFamilyApi();

  const result = await api.handle({
    action: "joinFamily",
    requestId: "req-join-without-profile-choice",
    data: {
      token: "some-token",
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-join-without-profile-choice",
    error: {
      code: "INVALID_ARGUMENT",
      message: "请明确选择是否允许家庭成员代管档案",
    },
  });
});

test("管理员撤销邀请后同一令牌立即不可用", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["user-1", "family-1", "membership-1", "invite-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "invite-revoker-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
    createInviteCredentials: () => ({
      token: "revoke-token-1",
      shortCode: "JK56LM",
      tokenHash: "revoke-token-hash-1",
      shortCodeHash: "revoke-short-code-hash-1",
    }),
    hashInviteToken: (token) =>
      token === "revoke-token-1"
        ? "revoke-token-hash-1"
        : "unknown-token-hash",
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-revoke",
    data: {
      name: "撤销邀请家庭",
    },
  });
  const created = await api.handle({
    action: "createInvite",
    requestId: "req-invite-for-revoke",
    data: {
      familyId: family.data.family.id,
    },
  });

  const revoked = await api.handle({
    action: "revokeInvite",
    requestId: "req-revoke-invite",
    data: {
      inviteId: created.data.invite.id,
    },
  });
  const resolved = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-revoked",
    data: {
      token: "revoke-token-1",
    },
  });

  assert.deepEqual(revoked, {
    ok: true,
    requestId: "req-revoke-invite",
    data: {
      invite: {
        id: "invite-1",
        status: "revoked",
      },
    },
  });
  assert.equal(resolved.ok, false);
  assert.equal(resolved.error.code, "INVITE_UNAVAILABLE");
});

test("现有有效成员使用同家庭邀请时不会改变角色或消耗邀请", async () => {
  const familyStore = createInMemoryFamilyStore();
  const ids = ["admin-user", "family-1", "admin-membership", "invite-1"];
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "existing-admin-openid",
    }),
    familyStore,
    createId: () => ids.shift(),
    now: () => new Date("2026-07-28T09:00:00.000Z"),
    createInviteCredentials: () => ({
      token: "self-join-token",
      shortCode: "NP78QR",
      tokenHash: "self-join-token-hash",
      shortCodeHash: "self-join-short-code-hash",
    }),
    hashInviteToken: () => "self-join-token-hash",
  });
  const family = await api.handle({
    action: "createFamily",
    requestId: "req-family-for-self-join",
    data: {
      name: "不应自我降级的家庭",
    },
  });
  await api.handle({
    action: "createInvite",
    requestId: "req-invite-for-self-join",
    data: {
      familyId: family.data.family.id,
    },
  });

  const joined = await api.handle({
    action: "joinFamily",
    requestId: "req-self-join",
    data: {
      token: "self-join-token",
      profileManagementAllowed: true,
    },
  });
  const bootstrapped = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-after-self-join",
  });
  const inviteStillAvailable = await api.handle({
    action: "resolveInvite",
    requestId: "req-resolve-after-self-join",
    data: {
      token: "self-join-token",
    },
  });

  assert.equal(joined.ok, false);
  assert.equal(joined.error.code, "ALREADY_MEMBER");
  assert.equal(bootstrapped.data.families[0].role, "admin");
  assert.equal(inviteStillAvailable.ok, true);
});

test("内部异常只返回安全错误，不暴露异常信息", async () => {
  const api = createFamilyApi({
    getCallerIdentity: async () => {
      throw new Error("sensitive database detail");
    },
  });

  const result = await api.handle({
    action: "bootstrap",
    requestId: "req-internal-error",
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-internal-error",
    error: {
      code: "INTERNAL_ERROR",
      message: "服务暂时不可用，请稍后重试",
    },
  });
});

test("bootstrap 不信任请求中伪造的身份和角色", async () => {
  const api = createFamilyApi({
    getCallerIdentity: async () => ({
      openId: "",
    }),
  });

  const result = await api.handle({
    action: "bootstrap",
    requestId: "req-forged-identity",
    openid: "forged-openid",
    userId: "forged-user",
    role: "admin",
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-forged-identity",
    error: {
      code: "UNAUTHENTICATED",
      message: "无法确认微信身份，请重新进入小程序",
    },
  });
});

test("用户可以修改自己的全局显示名称", async () => {
  const scenario = createFamilyScenario();
  await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-before-rename",
  });

  const renamed = await scenario.api.handle({
    action: "updateMyDisplayName",
    requestId: "req-rename-self",
    data: {
      displayName: "  妈妈  ",
    },
  });
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-after-rename",
  });

  assert.equal(renamed.ok, true);
  assert.equal(renamed.data.user.displayName, "妈妈");
  assert.equal(bootstrapped.data.user.displayName, "妈妈");
});

test("加入家庭时填写的名字立即成为全局显示名称", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const joined = await scenario.joinMember(
    family.id,
    "member-openid",
    "  爸爸  ",
  );

  assert.equal(joined.user.displayName, "爸爸");
});

test("普通成员不能把其他成员提升为管理员", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  await scenario.joinMember(family.id, "member-a-openid");
  scenario.useUser("admin-openid");
  const memberB = await scenario.joinMember(
    family.id,
    "member-b-openid",
  );
  scenario.useUser("member-a-openid");

  const result = await scenario.api.handle({
    action: "promoteMemberToAdmin",
    requestId: "req-member-promote",
    data: {
      familyId: family.id,
      targetUserId: memberB.user.id,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ADMIN_REQUIRED");
});

test("管理员可以把有效普通成员提升为管理员", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "promoted-member-openid",
  );
  scenario.useUser("admin-openid");

  const result = await scenario.api.handle({
    action: "promoteMemberToAdmin",
    requestId: "req-admin-promote",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });
  scenario.useUser("promoted-member-openid");
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-promoted-bootstrap",
  });

  assert.deepEqual(result.data.member, {
    id: member.user.id,
    role: "admin",
  });
  assert.equal(bootstrapped.data.families[0].role, "admin");
});

test("唯一管理员不能把自己降级为普通成员", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily("唯一管理员家庭");

  const result = await scenario.api.handle({
    action: "demoteSelfFromAdmin",
    requestId: "req-last-admin-demote",
    data: {
      familyId: family.id,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "LAST_ADMIN_CANNOT_DEMOTE");
});

test("存在另一名管理员时管理员可以降级自己", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "other-admin-openid",
  );
  scenario.useUser("admin-openid");
  await scenario.api.handle({
    action: "promoteMemberToAdmin",
    requestId: "req-promote-other-admin",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });

  const result = await scenario.api.handle({
    action: "demoteSelfFromAdmin",
    requestId: "req-demote-self",
    data: {
      familyId: family.id,
    },
  });
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-demoted-admin",
  });

  assert.deepEqual(result.data.member, {
    id: bootstrapped.data.user.id,
    role: "member",
  });
  assert.equal(bootstrapped.data.families[0].role, "member");
});

test("两名管理员同时降级自己时家庭仍保留一名管理员", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "concurrent-admin-openid",
  );
  scenario.useUser("admin-openid");
  await scenario.api.handle({
    action: "promoteMemberToAdmin",
    requestId: "req-promote-concurrent-admin",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });

  scenario.useUser("admin-openid");
  const first = scenario.api.handle({
    action: "demoteSelfFromAdmin",
    requestId: "req-concurrent-demote-a",
    data: {
      familyId: family.id,
    },
  });
  scenario.useUser("concurrent-admin-openid");
  const second = scenario.api.handle({
    action: "demoteSelfFromAdmin",
    requestId: "req-concurrent-demote-b",
    data: {
      familyId: family.id,
    },
  });
  const results = await Promise.all([first, second]);

  assert.deepEqual(
    results.map((result) =>
      result.ok ? "demoted" : result.error.code,
    ),
    ["demoted", "LAST_ADMIN_CANNOT_DEMOTE"],
  );
});

test("管理员不能移除另一名管理员", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "protected-admin-openid",
  );
  scenario.useUser("admin-openid");
  await scenario.api.handle({
    action: "promoteMemberToAdmin",
    requestId: "req-promote-protected-admin",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });

  const result = await scenario.api.handle({
    action: "removeMember",
    requestId: "req-remove-other-admin",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CANNOT_REMOVE_ADMIN");
});

test("管理员移除普通成员后对方立即失去家庭访问权限", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "removed-member-openid",
  );
  scenario.useUser("admin-openid");

  const removed = await scenario.api.handle({
    action: "removeMember",
    requestId: "req-remove-member",
    data: {
      familyId: family.id,
      targetUserId: member.user.id,
    },
  });
  scenario.useUser("removed-member-openid");
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-removed-member-bootstrap",
  });

  assert.deepEqual(removed.data.member, {
    id: member.user.id,
    status: "inactive",
  });
  assert.deepEqual(bootstrapped.data.families, []);
});

test("普通成员可以主动退出家庭并立即失去访问权限", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  await scenario.joinMember(family.id, "leaving-member-openid");

  const left = await scenario.api.handle({
    action: "leaveFamily",
    requestId: "req-member-leave",
    data: {
      familyId: family.id,
    },
  });
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-member-after-leave",
  });

  assert.equal(left.data.familyId, family.id);
  assert.equal(left.data.status, "inactive");
  assert.deepEqual(bootstrapped.data.families, []);
});

test("唯一管理员没有接任者时不能退出家庭", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily("不可无管理员家庭");

  const result = await scenario.api.handle({
    action: "leaveFamily",
    requestId: "req-last-admin-leave",
    data: {
      familyId: family.id,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "LAST_ADMIN_MUST_TRANSFER");
});

test("唯一管理员可以在同一操作中转让管理员并退出", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const successor = await scenario.joinMember(
    family.id,
    "successor-openid",
  );
  scenario.useUser("admin-openid");

  const transferred = await scenario.api.handle({
    action: "transferAdminAndLeave",
    requestId: "req-transfer-and-leave",
    data: {
      familyId: family.id,
      successorUserId: successor.user.id,
    },
  });
  const oldAdmin = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-old-admin-after-transfer",
  });
  scenario.useUser("successor-openid");
  const newAdmin = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-successor-after-transfer",
  });

  assert.deepEqual(transferred.data, {
    familyId: family.id,
    successor: {
      id: successor.user.id,
      role: "admin",
    },
    status: "inactive",
  });
  assert.deepEqual(oldAdmin.data.families, []);
  assert.equal(newAdmin.data.families[0].role, "admin");
});

test("成员离开只暂停其本人规则并清理对应的未来未打卡提醒", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily();
  const member = await scenario.joinMember(
    family.id,
    "cleanup-member-openid",
  );
  scenario.useUser("admin-openid");
  const admin = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-cleanup-admin-bootstrap",
  });
  const timestamp = new Date("2026-07-31T12:00:00.000Z");
  await scenario.familyStore.seedRecurringRuleForTest({
    _id: "leaving-subject-rule",
    familyId: family.id,
    subjectUserId: member.user.id,
    createdByUserId: admin.data.user.id,
    status: "active",
    revision: 1,
  });
  await scenario.familyStore.seedRecurringRuleForTest({
    _id: "leaving-creator-rule",
    familyId: family.id,
    subjectUserId: admin.data.user.id,
    createdByUserId: member.user.id,
    status: "active",
    revision: 1,
  });
  await scenario.familyStore.seedReminderForTest({
    _id: "future-pending-reminder",
    familyId: family.id,
    subjectUserId: member.user.id,
    sourceRecurringRuleId: "leaving-subject-rule",
    status: "pending",
    plannedAt: new Date(timestamp.getTime() + 60_000),
  });
  await scenario.familyStore.seedReminderForTest({
    _id: "past-pending-reminder",
    familyId: family.id,
    subjectUserId: member.user.id,
    sourceRecurringRuleId: "leaving-subject-rule",
    status: "pending",
    plannedAt: new Date(timestamp.getTime() - 60_000),
  });
  await scenario.familyStore.seedReminderForTest({
    _id: "future-completed-reminder",
    familyId: family.id,
    subjectUserId: member.user.id,
    sourceRecurringRuleId: "leaving-subject-rule",
    status: "completed",
    plannedAt: new Date(timestamp.getTime() + 60_000),
  });
  await scenario.familyStore.seedReminderForTest({
    _id: "standalone-future-reminder",
    familyId: family.id,
    subjectUserId: member.user.id,
    status: "pending",
    plannedAt: new Date(timestamp.getTime() + 60_000),
  });
  scenario.useUser("cleanup-member-openid");

  await scenario.api.handle({
    action: "leaveFamily",
    requestId: "req-leave-with-cleanup",
    data: {
      familyId: family.id,
    },
  });

  const pausedRule =
    await scenario.familyStore.getRecurringRuleForTest(
      "leaving-subject-rule",
    );
  const creatorRule =
    await scenario.familyStore.getRecurringRuleForTest(
      "leaving-creator-rule",
    );
  assert.equal(pausedRule.status, "paused");
  assert.equal(pausedRule.pauseReason, "subject_inactive");
  assert.equal(creatorRule.status, "active");
  assert.equal(
    await scenario.familyStore.getReminderForTest(
      "future-pending-reminder",
    ),
    null,
  );
  assert.ok(
    await scenario.familyStore.getReminderForTest(
      "past-pending-reminder",
    ),
  );
  assert.ok(
    await scenario.familyStore.getReminderForTest(
      "future-completed-reminder",
    ),
  );
  assert.ok(
    await scenario.familyStore.getReminderForTest(
      "standalone-future-reminder",
    ),
  );
});

test("普通成员不能解散家庭", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily("禁止越权解散");
  await scenario.joinMember(family.id, "dissolve-member-openid");

  const result = await scenario.api.handle({
    action: "dissolveFamily",
    requestId: "req-member-dissolve",
    data: {
      familyId: family.id,
      confirmationName: family.name,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ADMIN_REQUIRED");
});

test("管理员必须输入完整家庭名称才能解散", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily("需要二次确认的家庭");

  const result = await scenario.api.handle({
    action: "dissolveFamily",
    requestId: "req-dissolve-wrong-name",
    data: {
      familyId: family.id,
      confirmationName: "输入错了",
    },
  });
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-after-wrong-confirmation",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "CONFIRMATION_MISMATCH");
  assert.equal(bootstrapped.data.families.length, 1);
});

test("管理员二次确认后可以永久解散临时家庭", async () => {
  const scenario = createFamilyScenario();
  const family = await scenario.createFamily("待解散临时家庭");

  const result = await scenario.api.handle({
    action: "dissolveFamily",
    requestId: "req-dissolve-confirmed",
    data: {
      familyId: family.id,
      confirmationName: family.name,
    },
  });
  const bootstrapped = await scenario.api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap-after-dissolve",
  });

  assert.deepEqual(result.data, {
    familyId: family.id,
    dissolved: true,
  });
  assert.deepEqual(bootstrapped.data.families, []);
});
