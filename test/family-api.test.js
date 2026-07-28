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
