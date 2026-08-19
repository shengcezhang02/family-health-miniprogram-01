const assert = require("node:assert/strict");
const {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const test = require("node:test");

function findRelativeRequires(source) {
  return [...source.matchAll(/require\(["'](\.[^"']+)["']\)/g)].map(
    (match) => match[1],
  );
}

test("family-api 顶层部署包包含入口所需的全部本地模块", () => {
  const root = resolve(__dirname, "..");
  const functionDirectory = join(root, "cloudfunctions", "family-api");
  const deploymentDirectory = mkdtempSync(
    join(tmpdir(), "family-api-deployment-"),
  );

  try {
    for (const entry of readdirSync(functionDirectory, {
      withFileTypes: true,
    })) {
      if (!entry.isFile()) {
        continue;
      }

      cpSync(
        join(functionDirectory, entry.name),
        join(deploymentDirectory, entry.name),
      );
    }

    const entryPath = join(deploymentDirectory, "index.js");
    const entrySource = readFileSync(entryPath, "utf8");

    for (const request of findRelativeRequires(entrySource)) {
      assert.doesNotThrow(
        () => require.resolve(request, { paths: [dirname(entryPath)] }),
        `${request} 必须随 family-api 顶层部署包一起上传`,
      );
    }
  } finally {
    rmSync(deploymentDirectory, { recursive: true, force: true });
  }
});
