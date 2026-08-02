const test = require("node:test");
const assert = require("node:assert/strict");

const {
  completeHealthItemSave,
} = require("../miniprogram/services/health-item-save-feedback");

test("健康事项保存成功后先显示明确提示再跳转", async () => {
  const events = [];

  await completeHealthItemSave({
    mode: "recurring",
    showToast(options) {
      events.push(["toast", options]);
    },
    navigate(url) {
      events.push(["navigate", url]);
    },
    setTimer(callback, delay) {
      events.push(["wait", delay]);
      callback();
    },
  });

  assert.deepEqual(events, [
    [
      "toast",
      {
        title: "周期规则已保存",
        icon: "success",
        duration: 1200,
      },
    ],
    ["wait", 700],
    ["navigate", "/pages/daily-health/daily-health"],
  ]);
});
