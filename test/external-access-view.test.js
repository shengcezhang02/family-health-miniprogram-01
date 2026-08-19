const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createExternalAccessView,
} = require("../miniprogram/services/external-access-view");

test("AI 管理页把令牌和访问历史转换为清楚且不含内部代码的文案", () => {
  const view = createExternalAccessView({
    formatDateTime: (value) => `时间:${value}`,
  });
  const grouped = view.groupTokens([
    {
      id: "token-revoked",
      name: "旧助手",
      status: "revoked",
      secretHint: "ABCD",
      lastUsedAt: null,
      createdAt: "created-old",
      revokedAt: "revoked-old",
      revision: 2,
    },
    {
      id: "token-active",
      name: "我的 Codex",
      status: "active",
      secretHint: "7K3P",
      lastUsedAt: "last-used",
      createdAt: "created-new",
      revokedAt: null,
      revision: 1,
    },
  ]);
  const access = view.toAccessItem({
    id: "event-1",
    action: "updateHealthItem",
    familyName: "林家",
    resourceType: "record",
    resourceName: "血压",
    ok: false,
    resultCode: "REVISION_CONFLICT",
    accessedAt: "access-time",
  });

  assert.deepEqual(grouped.active.map((token) => token.name), ["我的 Codex"]);
  assert.equal(grouped.active[0].credentialHint, "…7K3P");
  assert.equal(grouped.active[0].lastUsedText, "时间:last-used");
  assert.deepEqual(grouped.revoked.map((token) => token.name), ["旧助手"]);
  assert.equal(grouped.revoked[0].lastUsedText, "尚未使用");
  assert.deepEqual(access, {
    id: "event-1",
    actionText: "修改健康事项",
    contextText: "林家 · 记录 · 血压",
    resultText: "数据已变化",
    resultTone: "warning",
    accessedAtText: "时间:access-time",
  });
});
