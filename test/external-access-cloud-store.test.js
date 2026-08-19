const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCloudExternalAccessStore,
} = require("../cloudfunctions/external-access-api/create-cloud-external-access-store");
const {
  createInMemoryCloudDatabase,
} = require("./support/create-in-memory-cloud-database");

test("CloudBase 存储原子创建令牌、记录访问并在撤销时销毁密文", async () => {
  const db = createInMemoryCloudDatabase({
    users: [
      {
        _id: "user-cloud-owner",
        wechatOpenId: "openid-cloud-owner",
      },
    ],
  });
  const store = createCloudExternalAccessStore(db);
  const token = {
    _id: "token-cloud-1",
    ownerUserId: "user-cloud-owner",
    name: "云端令牌",
    creationRequestId: "request-cloud-create",
    secretHash: "a".repeat(64),
    encryptedSecret: "encrypted-secret",
    encryptionNonce: "nonce",
    encryptionAuthTag: "auth-tag",
    revision: 1,
    revokedAt: null,
    createdAt: new Date("2026-08-19T05:00:00.000Z"),
    updatedAt: new Date("2026-08-19T05:00:00.000Z"),
  };

  const [first, second] = await Promise.all([
    store.createToken(token),
    store.createToken({ ...token, encryptedSecret: "losing-ciphertext" }),
  ]);
  await store.recordAccess({
    _id: "event-cloud-1",
    tokenId: token._id,
    ownerUserId: token.ownerUserId,
    requestId: "request-cloud-access",
    action: "getContext",
    ok: false,
    resultCode: "SERVICE_NOT_READY",
    durationMs: 3,
    accessedAt: new Date("2026-08-19T05:01:00.000Z"),
  });
  const recent = await store.listRecentAccesses({
    tokenId: token._id,
    ownerUserId: token.ownerUserId,
    limit: 20,
  });
  const revoked = await store.revokeToken({
    tokenId: token._id,
    ownerUserId: token.ownerUserId,
    expectedRevision: 1,
    timestamp: new Date("2026-08-19T05:02:00.000Z"),
  });

  assert.equal(first.encryptedSecret, "encrypted-secret");
  assert.equal(second.encryptedSecret, "encrypted-secret");
  assert.equal(recent.length, 1);
  assert.equal(recent[0]._id, "event-cloud-1");
  assert.equal(revoked.outcome, "revoked");
  assert.equal("encryptedSecret" in revoked.token, false);
  assert.equal(revoked.token.secretHash, null);
  assert.equal(
    db.read("external_access_tokens", token._id).lastUsedAt.toISOString(),
    "2026-08-19T05:01:00.000Z",
  );
});

test("访问历史在云端先按时间倒序并限制为 20 条", async () => {
  const calls = [];
  const query = {
    orderBy(field, direction) {
      calls.push(["orderBy", field, direction]);
      return this;
    },
    limit(value) {
      calls.push(["limit", value]);
      return this;
    },
    async get() {
      assert.deepEqual(calls, [
        ["orderBy", "accessedAt", "desc"],
        ["limit", 20],
      ]);
      return { data: [{ _id: "event-latest" }] };
    },
  };
  const db = {
    collection(name) {
      if (name === "external_access_tokens") {
        return {
          doc() {
            return {
              async get() {
                return {
                  data: {
                    _id: "token-history",
                    ownerUserId: "user-history",
                  },
                };
              },
            };
          },
        };
      }

      if (name === "external_access_events") {
        return {
          where(filter) {
            assert.deepEqual(filter, { tokenId: "token-history" });
            return query;
          },
        };
      }

      return {};
    },
  };
  const store = createCloudExternalAccessStore(db);

  const accesses = await store.listRecentAccesses({
    tokenId: "token-history",
    ownerUserId: "user-history",
    limit: 20,
  });

  assert.deepEqual(accesses, [{ _id: "event-latest" }]);
});
