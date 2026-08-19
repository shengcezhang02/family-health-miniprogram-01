const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalAccessApi,
} = require("../cloudfunctions/external-access-api/create-external-access-api");

function parseResponse(response) {
  return JSON.parse(response.body);
}

test("关闭实验开关时 HTTPS 外部入口表现为不可用", async () => {
  let callCount = 0;
  const api = createExternalAccessApi({
    isEnabled: () => false,
    dispatchBusinessAction: async () => {
      callCount += 1;
    },
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: { "x-forwarded-proto": "https" },
    body: JSON.stringify({
      action: "getContext",
      requestId: "request-disabled",
      payload: {},
    }),
  });

  assert.equal(response.statusCode, 404);
  assert.equal(parseResponse(response).error.code, "NOT_FOUND");
  assert.equal(callCount, 0);
});

test("明文 HTTP 请求即使功能开启也会被拒绝", async () => {
  const api = createExternalAccessApi({
    isEnabled: () => true,
    dispatchBusinessAction: async () => ({ ok: true, data: {} }),
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: { "x-forwarded-proto": "http" },
    body: "{}",
  });

  assert.equal(response.statusCode, 426);
  assert.equal(parseResponse(response).error.code, "HTTPS_REQUIRED");
});

test("HTTPS 入口只接受 POST /v1/action 和 JSON 请求体", async () => {
  const api = createExternalAccessApi({
    isEnabled: () => true,
    dispatchBusinessAction: async () => ({ ok: true, data: {} }),
  });

  const wrongMethod = await api.handle({
    httpMethod: "GET",
    path: "/v1/action",
    headers: { "x-forwarded-proto": "https" },
  });
  const wrongPath = await api.handle({
    httpMethod: "POST",
    path: "/v1/anything",
    headers: { "x-forwarded-proto": "https" },
    body: "{}",
  });
  const invalidJson = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: { "x-forwarded-proto": "https" },
    body: "not-json",
  });

  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(parseResponse(wrongMethod).error.code, "METHOD_NOT_ALLOWED");
  assert.equal(wrongPath.statusCode, 404);
  assert.equal(parseResponse(wrongPath).error.code, "NOT_FOUND");
  assert.equal(invalidJson.statusCode, 400);
  assert.equal(parseResponse(invalidJson).error.code, "INVALID_REQUEST");
});

test("有效 Bearer 调用业务后只记录不含健康值的访问摘要", async () => {
  const requests = [];
  const events = [];
  const actor = {
    userId: "user-token-owner",
    externalTokenId: "token-1",
    permissionPreset: "experimental_full_family_health_v1",
  };
  const api = createExternalAccessApi({
    isEnabled: () => true,
    authenticateAccessToken: async () => actor,
    dispatchBusinessAction: async (request, receivedActor) => {
      requests.push({ request, actor: receivedActor });
      return {
        ok: true,
        requestId: request.requestId,
        data: { status: "ready" },
      };
    },
    recordAccess: async (event) => events.push(event),
    createEventId: () => "event-1",
    now: () => new Date("2026-08-19T03:00:00.000Z"),
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: {
      "x-forwarded-proto": "https",
      authorization: "Bearer fhp_token-1.secret-placeholder",
    },
    body: JSON.stringify({
      action: "updateHealthItem",
      requestId: "request-https",
      payload: {
        familyId: "family-1",
        itemType: "record",
        itemId: "record-1",
        values: { temperature: 36.7 },
        remark: "不应进入历史的备注",
      },
    }),
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.match(response.headers["Strict-Transport-Security"], /max-age=/);
  assert.deepEqual(parseResponse(response), {
    ok: true,
    requestId: "request-https",
    data: { status: "ready" },
  });
  assert.deepEqual(requests, [
    {
      request: {
        action: "updateHealthItem",
        requestId: "request-https",
        payload: {
          familyId: "family-1",
          itemType: "record",
          itemId: "record-1",
          values: { temperature: 36.7 },
          remark: "不应进入历史的备注",
        },
      },
      actor,
    },
  ]);
  assert.deepEqual(events, [
    {
      _id: "event-1",
      tokenId: "token-1",
      ownerUserId: "user-token-owner",
      requestId: "request-https",
      action: "updateHealthItem",
      familyId: "family-1",
      resourceType: "record",
      resourceId: "record-1",
      ok: true,
      resultCode: "OK",
      durationMs: 0,
      accessedAt: new Date("2026-08-19T03:00:00.000Z"),
    },
  ]);
  assert.equal(JSON.stringify(events).includes("36.7"), false);
  assert.equal(JSON.stringify(events).includes("不应进入历史的备注"), false);
  assert.equal(JSON.stringify(events).includes("secret-placeholder"), false);
});

test("有效令牌遇到业务异常时记录脱敏失败并返回统一错误", async () => {
  const events = [];
  const reports = [];
  const api = createExternalAccessApi({
    isEnabled: () => true,
    authenticateAccessToken: async () => ({
      userId: "user-safe-error",
      externalTokenId: "token-safe-error",
      permissionPreset: "experimental_full_family_health_v1",
    }),
    dispatchBusinessAction: async () => {
      throw new Error("不应返回的体温 39.2 和内部路径");
    },
    recordAccess: async (event) => events.push(event),
    createEventId: () => "event-safe-error",
    now: () => new Date("2026-08-19T03:30:00.000Z"),
    reportError: (stage) => reports.push(stage),
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: {
      "x-forwarded-proto": "https",
      authorization: "Bearer fhp_hidden.hidden",
    },
    body: JSON.stringify({
      action: "getContext",
      requestId: "request-safe-error",
      payload: {},
    }),
  });
  const body = parseResponse(response);

  assert.equal(response.statusCode, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes("39.2"), false);
  assert.deepEqual(reports, ["dispatch"]);
  assert.equal(events.length, 1);
  assert.equal(events[0].resultCode, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(events).includes("39.2"), false);
});

test("访问历史写入失败时不返回可能已读取的业务数据", async () => {
  const reports = [];
  const api = createExternalAccessApi({
    isEnabled: () => true,
    authenticateAccessToken: async () => ({
      userId: "user-log-failure",
      externalTokenId: "token-log-failure",
      permissionPreset: "experimental_full_family_health_v1",
    }),
    dispatchBusinessAction: async (request) => ({
      ok: true,
      requestId: request.requestId,
      data: { privateValue: "不应返回" },
    }),
    recordAccess: async () => {
      throw new Error("history unavailable");
    },
    createEventId: () => "event-log-failure",
    now: () => new Date("2026-08-19T03:40:00.000Z"),
    reportError: (stage) => reports.push(stage),
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: {
      "x-forwarded-proto": "https",
      authorization: "Bearer fhp_hidden.hidden",
    },
    body: JSON.stringify({
      action: "getContext",
      requestId: "request-log-failure",
      payload: {},
    }),
  });
  const body = parseResponse(response);

  assert.equal(response.statusCode, 500);
  assert.equal(body.error.code, "INTERNAL_ERROR");
  assert.equal(JSON.stringify(body).includes("不应返回"), false);
  assert.deepEqual(reports, ["record-access"]);
});

test("令牌在读取期间被撤销时丢弃业务数据并返回未认证", async () => {
  const api = createExternalAccessApi({
    isEnabled: () => true,
    authenticateAccessToken: async () => ({
      userId: "user-revoked-during-read",
      externalTokenId: "token-revoked-during-read",
      permissionPreset: "experimental_full_family_health_v1",
    }),
    dispatchBusinessAction: async (request) => ({
      ok: true,
      requestId: request.requestId,
      data: { privateHealthValue: 36.8 },
    }),
    recordAccess: async () => ({ outcome: "token-unavailable" }),
    createEventId: () => "event-revoked-during-read",
    now: () => new Date("2026-08-19T03:50:00.000Z"),
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: {
      "x-forwarded-proto": "https",
      authorization: "Bearer fhp_hidden.hidden",
    },
    body: JSON.stringify({
      action: "getContext",
      requestId: "request-revoked-during-read",
      payload: {},
    }),
  });
  const body = parseResponse(response);

  assert.equal(response.statusCode, 401);
  assert.equal(body.error.code, "INVALID_CREDENTIAL");
  assert.equal(JSON.stringify(body).includes("36.8"), false);
});

test("云函数部署目录自带共享业务模块且默认不开放入口", async () => {
  const originalValue = process.env.EXTERNAL_ACCESS_ENABLED;
  delete process.env.EXTERNAL_ACCESS_ENABLED;

  try {
    const { main } = require("../cloudfunctions/external-access-api");
    const response = await main({
      httpMethod: "POST",
      path: "/v1/action",
      headers: { "x-forwarded-proto": "https" },
      body: JSON.stringify({
        action: "getContext",
        requestId: "request-packaged",
        payload: {},
      }),
    });

    assert.equal(response.statusCode, 404);
    assert.equal(parseResponse(response).error.code, "NOT_FOUND");
  } finally {
    if (originalValue === undefined) {
      delete process.env.EXTERNAL_ACCESS_ENABLED;
    } else {
      process.env.EXTERNAL_ACCESS_ENABLED = originalValue;
    }
  }
});
