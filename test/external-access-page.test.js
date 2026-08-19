const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

test("我和家庭提供 AI 与外部应用入口及完整令牌管理页面", () => {
  const root = resolve(__dirname, "..");
  const appJson = JSON.parse(
    readFileSync(join(root, "miniprogram", "app.json"), "utf8"),
  );
  const indexWxml = readFileSync(
    join(root, "miniprogram", "pages", "index", "index.wxml"),
    "utf8",
  );
  const pageWxml = readFileSync(
    join(
      root,
      "miniprogram",
      "pages",
      "external-access",
      "external-access.wxml",
    ),
    "utf8",
  );
  const pageJs = readFileSync(
    join(
      root,
      "miniprogram",
      "pages",
      "external-access",
      "external-access.js",
    ),
    "utf8",
  );

  assert.ok(appJson.pages.includes("pages/external-access/external-access"));
  assert.match(indexWxml, /AI 与外部应用/);
  assert.match(indexWxml, /onOpenExternalAccess/);
  assert.match(pageWxml, /创建永久令牌/);
  assert.match(pageWxml, /读取和修改我全部有效家庭/);
  assert.match(pageWxml, /复制令牌/);
  assert.match(pageWxml, /复制 Skill/);
  assert.match(pageWxml, /最近 20 次访问/);
  assert.match(pageWxml, /永久撤销这个令牌/);
  assert.match(pageJs, /callExternalAccessApi/);
  assert.doesNotMatch(
    pageJs,
    /(?:setStorage|setStorageSync)[\s\S]{0,120}(?:credential|createdToken)/,
  );
});
