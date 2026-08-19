const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

test("external-access-api 中的共享业务模块与唯一源码保持一致", () => {
  const root = resolve(__dirname, "..");
  const sourceDirectory = join(
    root,
    "packages",
    "family-health-business",
  );
  const packagedDirectory = join(
    root,
    "cloudfunctions",
    "external-access-api",
  );
  const copiedFiles = new Map([
    ["create-external-business-router.js", "create-external-business-router.js"],
    ["external-access-feature.js", "external-access-feature.js"],
    ["external-access-policy.js", "external-access-policy.js"],
    ["index.js", "family-health-business.js"],
    ["render-external-access-skill-draft.js", "render-external-access-skill-draft.js"],
  ]);

  for (const [sourceFileName, targetFileName] of copiedFiles) {
    assert.deepEqual(
      readFileSync(join(packagedDirectory, targetFileName)),
      readFileSync(join(sourceDirectory, sourceFileName)),
      `${sourceFileName} 应先执行 npm run build:external-business 再部署`,
    );
  }
});
