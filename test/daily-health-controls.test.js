const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDailyControlsSummary,
  toggleDailyControls,
} = require("../miniprogram/services/daily-health-controls");

test("每日健康操作区可折叠，并用一行文字保留当前筛选状态", () => {
  assert.equal(toggleDailyControls(false), true);
  assert.equal(toggleDailyControls(true), false);
  assert.equal(
    buildDailyControlsSummary({
      memberLabel: "小明",
      templateLabel: "体温",
      itemTypeLabel: "记录",
      displayMode: "grouped",
    }),
    "小明 · 体温 · 记录 · 分类",
  );
});

