const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalTokenAuthenticator,
  createExternalTokenSecurity,
} = require("../packages/family-health-business");
const {
  createInMemoryExternalAccessStore,
} = require("./support/create-in-memory-external-access-store");

test("Bearer 永久令牌只在完整匹配时映射为令牌所有者", async () => {
  const tokenStore = createInMemoryExternalAccessStore();
  const tokenSecurity = createExternalTokenSecurity({
    masterKey: Buffer.alloc(32, 9),
    keyVersion: "test-v1",
  });
  const credential = tokenSecurity.createCredential({
    tokenId: "token-auth-1",
    ownerUserId: "user-owner-1",
  });
  await tokenStore.createToken({
    _id: "token-auth-1",
    ownerUserId: "user-owner-1",
    permissionPreset: "experimental_full_family_health_v1",
    secretHash: credential.secretHash,
    encryptedSecret: credential.encryptedSecret,
    encryptionNonce: credential.encryptionNonce,
    encryptionAuthTag: credential.encryptionAuthTag,
    revokedAt: null,
  });
  const authenticator = createExternalTokenAuthenticator({
    tokenStore,
    tokenSecurity,
  });

  const actor = await authenticator.authenticate(
    `Bearer ${credential.credential}`,
  );
  const finalCharacter = credential.credential.at(-1);
  const tamperedCredential = `${credential.credential.slice(0, -1)}${
    finalCharacter === "A" ? "B" : "A"
  }`;
  const tampered = await authenticator.authenticate(
    `Bearer ${tamperedCredential}`,
  );

  assert.deepEqual(actor, {
    userId: "user-owner-1",
    externalTokenId: "token-auth-1",
    permissionPreset: "experimental_full_family_health_v1",
  });
  assert.deepEqual(tampered, {
    ok: false,
    code: "INVALID_CREDENTIAL",
    message: "访问凭证无效或已撤销",
  });
  assert.equal(JSON.stringify(tampered).includes(credential.credential), false);
});
