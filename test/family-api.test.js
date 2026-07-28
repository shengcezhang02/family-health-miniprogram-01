const test = require("node:test");
const assert = require("node:assert/strict");

const { createFamilyApi } = require("../cloudfunctions/family-api/src/create-family-api");

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
  });

  const result = await api.handle({
    action: "bootstrap",
    requestId: "req-bootstrap",
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-bootstrap",
    data: {
      authenticated: true,
    },
  });
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
