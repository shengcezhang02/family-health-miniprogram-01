const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalBusinessRouter,
} = require("../packages/family-health-business");

test("实验开关关闭时拒绝全部动作且不会触碰业务服务", async () => {
  let callCount = 0;
  const router = createExternalBusinessRouter({
    isEnabled: () => false,
    services: {
      context: async () => {
        callCount += 1;
      },
    },
  });

  const result = await router.execute({
    action: "getContext",
    requestId: "request-disabled",
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "EXTERNAL_ACCESS_DISABLED");
  assert.equal(callCount, 0);
});

test("白名单动作原样交给共享业务服务并保留调用者上下文", async () => {
  const calls = [];
  const actor = {
    userId: "user-1",
    externalTokenId: "token-1",
  };
  const router = createExternalBusinessRouter({
    isEnabled: () => true,
    services: {
      healthItems: async (request, receivedActor) => {
        calls.push({ request, actor: receivedActor });
        return {
          ok: true,
          requestId: request.requestId,
          data: { recordId: "record-1" },
        };
      },
    },
  });

  const result = await router.execute(
    {
      action: "createRecord",
      requestId: "request-1",
      payload: { familyId: "family-1" },
    },
    actor,
  );

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-1",
    data: { recordId: "record-1" },
  });
  assert.deepEqual(calls, [
    {
      request: {
        action: "createRecord",
        requestId: "request-1",
        data: { familyId: "family-1" },
      },
      actor,
    },
  ]);
});

test("伪造动作在调用业务服务前被稳定拒绝", async () => {
  let callCount = 0;
  const router = createExternalBusinessRouter({
    isEnabled: () => true,
    services: {
      healthItems: async () => {
        callCount += 1;
      },
    },
  });

  const result = await router.execute({
    action: "restoreItem",
    requestId: "request-forbidden",
    payload: { recordId: "record-1" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "ACTION_NOT_ALLOWED");
  assert.equal(callCount, 0);
});

test("尚未接入的业务领域返回安全错误而不是绕过规则自行实现", async () => {
  const router = createExternalBusinessRouter({
    isEnabled: () => true,
    services: {},
  });

  const result = await router.execute({
    action: "listTemplates",
    requestId: "request-not-ready",
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SERVICE_NOT_READY");
});
