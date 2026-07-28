const test = require("node:test");
const assert = require("node:assert/strict");

const { createFamilyApi } = require("../cloudfunctions/family-api/src/create-family-api");
const {
  createInMemoryFamilyStore,
} = require("./support/create-in-memory-family-store");

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
