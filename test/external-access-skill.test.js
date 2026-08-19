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
