const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("关心分享云函数包含完整部署配置，源码目录会随函数上传", () => {
  const functionDirectory = path.join(
    __dirname,
    "..",
    "cloudfunctions",
    "share-api",
  );
  const configPath = path.join(functionDirectory, "config.json");
  const packageLockPath = path.join(functionDirectory, "package-lock.json");

  assert.equal(fs.existsSync(configPath), true);
  assert.equal(fs.existsSync(packageLockPath), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath, "utf8")), {
    permissions: { openapi: [] },
  });
  assert.equal(
    fs.existsSync(path.join(functionDirectory, "src", "create-care-share-api.js")),
    true,
  );
});
