const assert = require("node:assert/strict");
const test = require("node:test");

const {
  renderExternalAccessSkillDraft,
} = require("../packages/family-health-business");

test("Skill 草案只生成 HTTPS curl 且明确禁止回收站能力", () => {
  const skill = renderExternalAccessSkillDraft({
    baseUrl: "https://family-health.example.com",
    token: "fhp_test.secret-placeholder",
  });

  assert.match(skill, /Base URL: https:\/\/family-health\.example\.com/);
  assert.match(skill, /Authorization token: fhp_test\.secret-placeholder/);
  assert.match(skill, /curl -X POST/);
  assert.match(skill, /Authorization: Bearer fhp_test\.secret-placeholder/);
  assert.match(skill, /不得尝试访问、恢复、修改或永久删除回收站内容/);
  assert.doesNotMatch(skill, /http:\/\//);
  assert.doesNotMatch(skill, /--insecure|-k\s/);
});

test("Skill 草案拒绝明文 HTTP、凭据 URL 和非 fhp 令牌", () => {
  assert.throws(
    () =>
      renderExternalAccessSkillDraft({
        baseUrl: "http://family-health.example.com",
        token: "fhp_test.secret-placeholder",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      renderExternalAccessSkillDraft({
        baseUrl: "https://user:pass@family-health.example.com",
        token: "fhp_test.secret-placeholder",
      }),
    /地址/,
  );
  assert.throws(
    () =>
      renderExternalAccessSkillDraft({
        baseUrl: "https://family-health.example.com",
        token: "not-a-family-health-token",
      }),
    /令牌/,
  );
});

test("AI-M3 Skill 给出读取、写入、软删除和模板管理示例", () => {
  const skill = renderExternalAccessSkillDraft({
    baseUrl: "https://family-health.example.com",
    token: "fhp_test.secret-placeholder",
  });

  assert.match(skill, /## 已可用的只读动作/);
  assert.match(skill, /`getContext`/);
  assert.match(skill, /`listTemplates`/);
  assert.match(skill, /`listHealthItems`/);
  assert.match(skill, /`getHealthItem`/);
  assert.match(skill, /itemType.*record.*reminder.*recurring_rule/s);
  assert.match(skill, /nextCursor/);
  assert.match(skill, /cursor/);
  assert.match(skill, /令牌所有者仍是该家庭的有效成员/);
  assert.match(skill, /同一家庭所有成员/);
  assert.doesNotMatch(skill, /成员未确认|externalAccessReady=false/);
  for (const action of [
    "createRecord",
    "createReminder",
    "createRecurringRule",
    "updateHealthItem",
    "checkInReminder",
    "pauseRule",
    "resumeRule",
    "softDeleteItem",
    "createCustomTemplate",
    "updateCustomTemplate",
    "setTemplateStatus",
    "copySystemTemplate",
    "updateSystemTemplateSettings",
  ]) {
    assert.match(skill, new RegExp(`\\b${action}\\b`), action);
  }
  assert.match(skill, /expectedRevision/);
  assert.match(skill, /familyRevision/);
  assert.match(skill, /软删除/);
  assert.doesNotMatch(skill, /尚未开放|SERVICE_NOT_READY/);
});
