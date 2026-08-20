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

test("AI-M3 Skill 给出精简的读取、写入、软删除和模板管理说明", () => {
  const skill = renderExternalAccessSkillDraft({
    baseUrl: "https://family-health.example.com",
    token: "fhp_test.secret-placeholder",
  });

  assert.match(skill, /## 读取/);
  assert.match(skill, /## 写入/);
  assert.match(skill, /`getContext`/);
  assert.match(skill, /`listTemplates`/);
  assert.match(skill, /`listHealthItems`/);
  assert.match(skill, /`getHealthItem`/);
  assert.match(skill, /itemType.*record.*reminder.*recurring_rule/s);
  assert.match(skill, /nextCursor/);
  assert.match(skill, /cursor/);
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

test("复制给 AI 的 Skill 只说明接口用法而不展开成员授权政策", () => {
  const skill = renderExternalAccessSkillDraft({
    baseUrl: "https://family-health.example.com",
    token: "fhp_test.secret-placeholder",
  });

  assert.match(skill, /先调用 `getContext` 获取可用 ID 和模板字段/);
  assert.match(skill, /只使用接口返回的 ID/);
  assert.doesNotMatch(
    skill,
    /无需逐人确认|不需要等待其他成员|同一家庭所有成员|成员未确认|外部访问告知/,
  );
  assert.ok(skill.length < 4500, `Skill 仍有 ${skill.length} 个字符`);
});

test("Skill 用一个通用 curl 和少量示例覆盖全部动作", () => {
  const skill = renderExternalAccessSkillDraft({
    baseUrl: "https://family-health.example.com",
    token: "fhp_test.secret-placeholder",
  });

  assert.equal((skill.match(/curl -X POST/g) || []).length, 1);
  assert.ok(
    (skill.match(/```json/g) || []).length <= 2,
    "JSON 示例应保留代表性用法，其他动作使用参数表说明",
  );
  assert.ok(skill.length < 3500, `Skill 仍有 ${skill.length} 个字符`);
});
