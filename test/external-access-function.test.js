const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalAccessFunction,
} = require("../cloudfunctions/external-access-api/create-external-access-function");

test("同一云函数把微信管理事件与 HTTP action 送到不同窄接口", async () => {
  const calls = [];
  const main = createExternalAccessFunction({
    managementApi: {
      async handle(event) {
        calls.push({ kind: "management", event });
        return { ok: true, data: { tokens: [] } };
      },
    },
    httpApi: {
      async handle(event) {
        calls.push({ kind: "http", event });
        return { statusCode: 404, body: "{}" };
      },
    },
  });

  const managementResult = await main({
    action: "listTokens",
    requestId: "request-list-tokens",
  });
  const httpResult = await main({
    httpMethod: "POST",
    path: "/v1/action",
  });

  assert.deepEqual(managementResult, {
    ok: true,
    data: { tokens: [] },
  });
  assert.deepEqual(httpResult, { statusCode: 404, body: "{}" });
  assert.deepEqual(
    calls.map((call) => call.kind),
    ["management", "http"],
  );
});
