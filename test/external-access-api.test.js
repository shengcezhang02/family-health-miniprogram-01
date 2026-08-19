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

test("合法 HTTPS action 由共享业务路由处理且响应禁止缓存", async () => {
  const requests = [];
  const api = createExternalAccessApi({
    isEnabled: () => true,
    dispatchBusinessAction: async (request) => {
      requests.push(request);
      return {
        ok: true,
        requestId: request.requestId,
        data: { status: "ready" },
      };
    },
  });

  const response = await api.handle({
    httpMethod: "POST",
    path: "/v1/action",
    headers: { "x-forwarded-proto": "https" },
    body: JSON.stringify({
      action: "getContext",
      requestId: "request-https",
      payload: {},
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
      action: "getContext",
      requestId: "request-https",
      payload: {},
    },
  ]);
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
