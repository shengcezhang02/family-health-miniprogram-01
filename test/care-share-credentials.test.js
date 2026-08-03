const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCareShareSecurity,
} = require("../cloudfunctions/share-api/src/create-care-share-security");

test("分享令牌至少包含 128 位不可猜测信息且重试时可安全复现", () => {
  const security = createCareShareSecurity({
    hashKey: "test-only-care-share-secret",
  });
  const input = {
    callerUserId: "user-1",
    requestId: "request-1",
  };

  const first = security.createCredentials(input);
  const retried = security.createCredentials(input);
  const another = security.createCredentials({
    ...input,
    requestId: "request-2",
  });

  assert.match(first.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(first.token, retried.token);
  assert.equal(first.tokenHash, retried.tokenHash);
  assert.notEqual(first.token, another.token);
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.tokenHash, security.hashToken(first.token));
});
