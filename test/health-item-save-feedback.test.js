const test = require("node:test");
const assert = require("node:assert/strict");

const {
  completeHealthItemSave,
} = require("../miniprogram/services/health-item-save-feedback");

test("没有上一页时，健康事项保存成功后先提示再返回默认页", async () => {
  const events = [];

  await completeHealthItemSave({
    mode: "recurring",
    showToast(options) {
      events.push(["toast", options]);
    },
    canNavigateBack: false,
    navigateBack() {
      events.push(["back"]);
    },
    navigateFallback(url) {
      events.push(["fallback", url]);
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
    ["fallback", "/pages/daily-health/daily-health"],
  ]);
});

test("有上一页时，保存后返回实际来源页而不强制切换标签", async () => {
  const events = [];

  await completeHealthItemSave({
    mode: "record",
    canNavigateBack: true,
    showToast(options) {
      events.push(["toast", options.title]);
    },
    navigateBack() {
      events.push(["back"]);
    },
    navigateFallback(url) {
      events.push(["fallback", url]);
    },
    setTimer(callback) {
      callback();
    },
  });

  assert.deepEqual(events, [["toast", "记录已保存"], ["back"]]);
});
