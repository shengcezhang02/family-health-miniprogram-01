const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInviteSecurity,
} = require("../cloudfunctions/family-api/src/create-invite-security");

test("邀请安全模块只返回随机凭据并能稳定计算不可逆摘要", () => {
  const security = createInviteSecurity({
    hashKey: "test-only-hash-key",
  });

  const credentials = security.createCredentials();

  assert.match(credentials.token, /^[A-Za-z0-9_-]{32}$/);
  assert.match(credentials.shortCode, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(
    credentials.tokenHash,
    security.hashToken(credentials.token),
  );
  assert.equal(
    credentials.shortCodeHash,
    security.hashShortCode(credentials.shortCode.toLowerCase()),
  );
  assert.notEqual(credentials.tokenHash, credentials.token);
  assert.notEqual(credentials.shortCodeHash, credentials.shortCode);
});
