const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getHealthItemColorStyles,
  getHealthItemTone,
} = require("../miniprogram/services/health-item-appearance");

test("系统健康项目使用稳定且彼此不同的视觉色调", () => {
  const tones = [
    getHealthItemTone("sys_blood_pressure"),
    getHealthItemTone("sys_blood_glucose"),
    getHealthItemTone("sys_medication"),
    getHealthItemTone("sys_temperature"),
  ];

  assert.deepEqual(tones, [
    "blood-pressure",
    "blood-glucose",
    "medication",
    "temperature",
  ]);
  assert.equal(new Set(tones).size, tones.length);
  assert.equal(getHealthItemTone("custom-template"), "purple");
  assert.equal(getHealthItemTone("custom-template", "teal"), "teal");
  assert.equal(getHealthItemTone("custom-template", "unknown"), "purple");
});

test("自定义颜色代码生成受控的卡片、标题和行内渐变样式", () => {
  assert.equal(
    getHealthItemTone("custom-template", "#3A7F91"),
    "custom-color",
  );

  const styles = getHealthItemColorStyles(
    "custom-template",
    "#3A7F91",
  );

  assert.match(styles.surfaceStyle, /rgba\(58, 127, 145, 0\.17\)/);
  assert.match(styles.labelStyle, /#3A7F91/);
  assert.match(styles.rowStyle, /linear-gradient/);
  assert.deepEqual(
    getHealthItemColorStyles("custom-template", "not-a-color"),
    {},
  );
});
