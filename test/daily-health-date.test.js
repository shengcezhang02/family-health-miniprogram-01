const assert = require("node:assert/strict");
const test = require("node:test");

const {
  getDailyDatePresentation,
  shiftDailyDate,
} = require("../miniprogram/services/daily-health-date");

test("每日健康可以切换前一天和后一天", () => {
  assert.equal(shiftDailyDate("2026-07-29", -1), "2026-07-28");
  assert.equal(shiftDailyDate("2026-07-29", 1), "2026-07-30");
});

test("日期选择器清楚显示今天、日期和星期", () => {
  assert.deepEqual(
    getDailyDatePresentation("2026-07-29", "2026-07-29"),
    {
      title: "今天",
      subtitle: "7月29日 · 周三",
    },
  );
  assert.deepEqual(
    getDailyDatePresentation("2026-07-28", "2026-07-29"),
    {
      title: "7月28日",
      subtitle: "周二",
    },
  );
});
