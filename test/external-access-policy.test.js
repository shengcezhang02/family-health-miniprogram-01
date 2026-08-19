const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EXTERNAL_ACCESS_ACTIONS,
  EXTERNAL_ACCESS_NOTICE_VERSION,
  EXTERNAL_ACCESS_PERMISSION_PRESET,
  getExternalAccessAction,
  isExternalAccessEnabled,
} = require("../packages/family-health-business");

test("AI-M0 的外部访问实验开关默认关闭且只接受明确的 true", () => {
  assert.equal(isExternalAccessEnabled({}), false);
  assert.equal(
    isExternalAccessEnabled({ EXTERNAL_ACCESS_ENABLED: "false" }),
    false,
  );
  assert.equal(
    isExternalAccessEnabled({ EXTERNAL_ACCESS_ENABLED: "TRUE" }),
    false,
  );
  assert.equal(
    isExternalAccessEnabled({ EXTERNAL_ACCESS_ENABLED: "true" }),
    true,
  );
});

test("实验权限预设和家庭告知使用同一个稳定版本", () => {
  assert.equal(
    EXTERNAL_ACCESS_PERMISSION_PRESET,
    "experimental_full_family_health_v1",
  );
  assert.equal(
    EXTERNAL_ACCESS_NOTICE_VERSION,
    EXTERNAL_ACCESS_PERMISSION_PRESET,
  );
});

test("固定动作目录覆盖已确认能力但永不暴露回收站", () => {
  assert.deepEqual(Object.keys(EXTERNAL_ACCESS_ACTIONS), [
    "getContext",
    "listHealthItems",
    "getHealthItem",
    "listTemplates",
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
  ]);

  assert.equal(getExternalAccessAction("restoreItem"), null);
  assert.equal(getExternalAccessAction("getRecycleBin"), null);
  assert.equal(getExternalAccessAction("permanentlyDeleteItem"), null);
});

test("每个外部动作只路由到一个既有业务领域，不携带权限捷径", () => {
  for (const [action, definition] of Object.entries(
    EXTERNAL_ACCESS_ACTIONS,
  )) {
    assert.ok(["context", "healthItems", "templates"].includes(definition.service));
    assert.equal(definition.operation, action);
    assert.ok(["read", "write"].includes(definition.mode));
    assert.deepEqual(Object.keys(definition).sort(), [
      "mode",
      "operation",
      "service",
    ]);
  }
});
