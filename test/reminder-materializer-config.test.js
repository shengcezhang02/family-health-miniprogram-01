const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("提醒生成函数每天凌晨两点自动补齐未来提醒", () => {
  const configPath = path.join(
    __dirname,
    "..",
    "cloudfunctions",
    "reminder-materializer",
    "config.json",
  );
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  assert.deepEqual(config.triggers, [
    {
      name: "materializeDaily",
      type: "timer",
      config: "0 0 2 * * * *",
    },
  ]);
});
