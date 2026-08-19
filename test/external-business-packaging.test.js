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
    ["create-external-access-management.js", "create-external-access-management.js"],
    ["create-external-business-router.js", "create-external-business-router.js"],
    ["create-external-read-services.js", "create-external-read-services.js"],
    ["create-external-write-services.js", "create-external-write-services.js"],
    ["create-external-token-authenticator.js", "create-external-token-authenticator.js"],
    ["create-external-token-security.js", "create-external-token-security.js"],
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

  const businessCopies = [
    ["health-item-api", "create-health-item-api.js"],
    ["health-item-api", "create-cloud-health-item-store.js"],
    ["template-api", "create-template-api.js"],
    ["template-api", "create-cloud-template-store.js"],
    ["template-api", "template-history.js"],
  ];

  for (const [cloudfunction, fileName] of businessCopies) {
    assert.deepEqual(
      readFileSync(join(packagedDirectory, fileName)),
      readFileSync(
        join(root, "cloudfunctions", cloudfunction, "src", fileName),
      ),
      `${fileName} 应从现有业务云函数同步后再部署`,
    );
  }


  assert.deepEqual(
    readFileSync(
      join(root, "cloudfunctions", "template-api", "src", "system-templates.js"),
    ),
    readFileSync(join(packagedDirectory, "external-system-templates.js")),
    "系统模板应从当前模板业务源码同步后再部署",
  );
  assert.deepEqual(
    readFileSync(
      join(root, "cloudfunctions", "template-api", "src", "system-templates.js"),
    ),
    readFileSync(join(packagedDirectory, "system-templates.js")),
    "写入适配使用的系统模板应与模板业务源码一致",
  );
});
