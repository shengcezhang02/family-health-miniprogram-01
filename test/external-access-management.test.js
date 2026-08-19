const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalAccessManagement,
  createExternalTokenSecurity,
} = require("../packages/family-health-business");
const {
  createInMemoryExternalAccessStore,
} = require("./support/create-in-memory-external-access-store");

function createFixture({ noticeStore } = {}) {
  const user = {
    _id: "user-token-owner",
    wechatOpenId: "openid-token-owner",
    displayName: "小林",
  };
  const otherUser = {
    _id: "user-other",
    wechatOpenId: "openid-other",
    displayName: "其他成员",
  };
  let currentOpenId = user.wechatOpenId;
  const tokenStore = createInMemoryExternalAccessStore({
    users: [user, otherUser],
  });
  const tokenSecurity = createExternalTokenSecurity({
    masterKey: Buffer.alloc(32, 7),
    keyVersion: "test-v1",
  });
  const api = createExternalAccessManagement({
    getCallerIdentity: async () => ({ openId: currentOpenId }),
    tokenStore,
    tokenSecurity,
    createId: () => "token-01",
    now: () => new Date("2026-08-19T02:00:00.000Z"),
    externalBaseUrl: "https://family-health.example.com",
    noticeStore,
  });

  return {
    api,
    tokenStore,
    useOtherUser() {
      currentOpenId = otherUser.wechatOpenId;
    },
  };
}

test("用户可以查看每个家庭的外部访问告知状态", async () => {
  const { api } = createFixture({
    noticeStore: {
      async listFamilyContextsByUserId(userId) {
        assert.equal(userId, "user-token-owner");
        return {
          user: {
            _id: "user-token-owner",
            displayName: "小林",
          },
          familyContexts: [
            {
              family: { _id: "family-ready", name: "已就绪家庭" },
              callerMembership: {
                userId: "user-token-owner",
                externalAccessNoticeVersion:
                  "experimental_full_family_health_v1",
              },
              activeMemberships: [
                {
                  userId: "user-token-owner",
                  externalAccessNoticeVersion:
                    "experimental_full_family_health_v1",
                },
              ],
            },
            {
              family: { _id: "family-waiting", name: "等待确认家庭" },
              callerMembership: {
                userId: "user-token-owner",
              },
              activeMemberships: [
                { userId: "user-token-owner" },
                { userId: "user-2" },
              ],
            },
          ],
        };
      },
    },
  });

  const result = await api.handle({
    action: "getExternalAccessNoticeStatus",
    requestId: "request-notice-status",
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-notice-status",
    data: {
      noticeVersion: "experimental_full_family_health_v1",
      allAcceptedByCaller: false,
      families: [
        {
          id: "family-ready",
          name: "已就绪家庭",
          acceptedByCaller: true,
          externalAccessReady: true,
          waitingForMemberCount: 0,
        },
        {
          id: "family-waiting",
          name: "等待确认家庭",
          acceptedByCaller: false,
          externalAccessReady: false,
          waitingForMemberCount: 2,
        },
      ],
    },
  });
});

test("用户明确确认后只更新自己全部有效家庭的告知版本", async () => {
  const calls = [];
  const noticeStore = {
    async acceptExternalAccessNotice(input) {
      calls.push(input);
      return { updatedCount: 2 };
    },
    async listFamilyContextsByUserId() {
      return {
        user: { _id: "user-token-owner", displayName: "小林" },
        familyContexts: [],
      };
    },
  };
  const { api } = createFixture({ noticeStore });

  const result = await api.handle({
    action: "acceptExternalAccessNotice",
    requestId: "request-accept-notice",
    data: { acknowledged: true },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "request-accept-notice",
    data: {
      noticeVersion: "experimental_full_family_health_v1",
      updatedFamilyCount: 2,
    },
  });
  assert.deepEqual(calls, [
    {
      userId: "user-token-owner",
      noticeVersion: "experimental_full_family_health_v1",
      acceptedAt: new Date("2026-08-19T02:00:00.000Z"),
    },
  ]);
});

test("用户创建永久令牌后列表只展示摘要，存储中没有原始 secret", async () => {
  const { api, tokenStore } = createFixture();

  const created = await api.handle({
    action: "createToken",
    requestId: "request-create-token-1",
    data: {
      name: "我的 Codex",
      riskAcknowledged: true,
    },
  });
  const listed = await api.handle({
    action: "listTokens",
    requestId: "request-list-token-1",
  });

  assert.equal(created.ok, true);
  assert.match(
    created.data.token.credential,
    /^fhp_token-01\.[A-Za-z0-9_-]{43}$/,
  );
  assert.deepEqual(listed, {
    ok: true,
    requestId: "request-list-token-1",
    data: {
      tokens: [
        {
          id: "token-01",
          name: "我的 Codex",
          status: "active",
          permissionPreset: "experimental_full_family_health_v1",
          secretHint: created.data.token.credential.slice(-4),
          lastUsedAt: null,
          createdAt: "2026-08-19T02:00:00.000Z",
          revokedAt: null,
          revision: 1,
        },
      ],
    },
  });

  const [stored] = tokenStore.inspectTokens();
  assert.equal("credential" in stored, false);
  assert.equal("secret" in stored, false);
  assert.equal(stored.encryptedSecret.includes(created.data.token.credential), false);
  assert.equal(stored.secretHash.length, 64);
  assert.equal(stored.encryptionNonce.length > 0, true);
  assert.equal(stored.encryptionAuthTag.length > 0, true);
});

test("创建令牌网络重试复用同一枚永久令牌和原始凭证", async () => {
  const { api, tokenStore } = createFixture();
  const request = {
    action: "createToken",
    requestId: "request-create-token-retry",
    data: {
      name: "自动化助手",
      riskAcknowledged: true,
    },
  };

  const first = await api.handle(request);
  const retried = await api.handle(request);

  assert.equal(first.ok, true);
  assert.equal(retried.ok, true);
  assert.equal(
    retried.data.token.credential,
    first.data.token.credential,
  );
  assert.equal(tokenStore.inspectTokens().length, 1);
});

test("同一创建 requestId 不能被换名后重用", async () => {
  const { api } = createFixture();
  const requestId = "request-create-token-conflict";
  await api.handle({
    action: "createToken",
    requestId,
    data: {
      name: "第一枚名称",
      riskAcknowledged: true,
    },
  });

  const conflicted = await api.handle({
    action: "createToken",
    requestId,
    data: {
      name: "被替换的名称",
      riskAcknowledged: true,
    },
  });

  assert.equal(conflicted.ok, false);
  assert.equal(conflicted.error.code, "REQUEST_CONFLICT");
});

test("同一 requestId 并发创建只会产生并返回同一枚令牌", async () => {
  const { api, tokenStore } = createFixture();
  const request = {
    action: "createToken",
    requestId: "request-create-token-concurrently",
    data: {
      name: "并发安全令牌",
      riskAcknowledged: true,
    },
  };

  const [first, second] = await Promise.all([
    api.handle(request),
    api.handle(request),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(
    first.data.token.credential,
    second.data.token.credential,
  );
  assert.equal(tokenStore.inspectTokens().length, 1);
});

test("只有令牌所有者可以重新复制仍然有效的原始令牌", async () => {
  const fixture = createFixture();
  const created = await fixture.api.handle({
    action: "createToken",
    requestId: "request-create-copyable-token",
    data: {
      name: "可复制令牌",
      riskAcknowledged: true,
    },
  });
  const copied = await fixture.api.handle({
    action: "copyToken",
    requestId: "request-copy-token",
    data: { tokenId: created.data.token.id },
  });

  assert.equal(copied.ok, true);
  assert.equal(
    copied.data.credential,
    created.data.token.credential,
  );

  fixture.useOtherUser();
  const denied = await fixture.api.handle({
    action: "copyToken",
    requestId: "request-copy-token-as-other-user",
    data: { tokenId: created.data.token.id },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "TOKEN_NOT_FOUND");
  assert.equal(JSON.stringify(denied).includes("secret"), false);
});

test("有效令牌可以即时生成包含同一凭证的 HTTPS Skill", async () => {
  const { api, tokenStore } = createFixture();
  const created = await api.handle({
    action: "createToken",
    requestId: "request-create-skill-token",
    data: {
      name: "Skill 令牌",
      riskAcknowledged: true,
    },
  });

  const rendered = await api.handle({
    action: "renderTokenSkill",
    requestId: "request-render-token-skill",
    data: { tokenId: created.data.token.id },
  });

  assert.equal(rendered.ok, true);
  assert.match(rendered.data.skill, /Base URL: https:\/\/family-health\.example\.com/);
  assert.ok(rendered.data.skill.includes(created.data.token.credential));
  assert.equal("skill" in tokenStore.inspectTokens()[0], false);
});

test("永久撤销会销毁可恢复密文并立即禁止再次复制", async () => {
  const { api, tokenStore } = createFixture();
  const created = await api.handle({
    action: "createToken",
    requestId: "request-create-revoked-token",
    data: {
      name: "稍后撤销",
      riskAcknowledged: true,
    },
  });

  const revoked = await api.handle({
    action: "revokeToken",
    requestId: "request-revoke-token",
    data: {
      tokenId: created.data.token.id,
      expectedRevision: 1,
    },
  });
  const copied = await api.handle({
    action: "copyToken",
    requestId: "request-copy-revoked-token",
    data: { tokenId: created.data.token.id },
  });
  const listed = await api.handle({
    action: "listTokens",
    requestId: "request-list-revoked-token",
  });

  assert.equal(revoked.ok, true);
  assert.equal(revoked.data.token.status, "revoked");
  assert.equal(revoked.data.token.revision, 2);
  assert.equal(copied.ok, false);
  assert.equal(copied.error.code, "TOKEN_REVOKED");
  assert.equal(listed.data.tokens[0].status, "revoked");
  const [stored] = tokenStore.inspectTokens();
  assert.equal("encryptedSecret" in stored, false);
  assert.equal("encryptionNonce" in stored, false);
  assert.equal("encryptionAuthTag" in stored, false);
  assert.equal(stored.secretHash, null);
});

test("令牌详情只返回最近 20 次脱敏访问并更新最近使用时间", async () => {
  const { api, tokenStore } = createFixture();
  const created = await api.handle({
    action: "createToken",
    requestId: "request-create-history-token",
    data: {
      name: "访问历史令牌",
      riskAcknowledged: true,
    },
  });

  for (let index = 0; index < 25; index += 1) {
    await tokenStore.recordAccess({
      _id: `event-${index}`,
      tokenId: created.data.token.id,
      ownerUserId: "user-token-owner",
      requestId: `request-history-${index}`,
      action: index % 2 === 0 ? "getContext" : "updateHealthItem",
      familyId: "family-1",
      resourceType: "record",
      resourceId: `record-${index}`,
      ok: index % 3 !== 0,
      resultCode: index % 3 !== 0 ? "OK" : "REVISION_CONFLICT",
      durationMs: index,
      accessedAt: new Date(
        Date.parse("2026-08-19T04:00:00.000Z") + index * 1000,
      ),
      values: { temperature: 36.7 },
      authorization: "Bearer should-never-leave-store",
    });
  }

  const history = await api.handle({
    action: "getRecentAccesses",
    requestId: "request-get-recent-accesses",
    data: { tokenId: created.data.token.id },
  });
  const listed = await api.handle({
    action: "listTokens",
    requestId: "request-list-after-access",
  });

  assert.equal(history.ok, true);
  assert.equal(history.data.accesses.length, 20);
  assert.equal(history.data.accesses[0].id, "event-24");
  assert.equal(history.data.accesses[19].id, "event-5");
  assert.equal(
    listed.data.tokens[0].lastUsedAt,
    "2026-08-19T04:00:24.000Z",
  );
  assert.equal(JSON.stringify(history).includes("36.7"), false);
  assert.equal(JSON.stringify(history).includes("should-never-leave-store"), false);
});
