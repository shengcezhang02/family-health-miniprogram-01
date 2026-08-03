const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDisplayPreference,
  getDisplaySizeOptions,
} = require("../miniprogram/services/display-preference");

test("显示偏好未设置时默认使用大字档", () => {
  const preference = createDisplayPreference({
    get: () => "",
    set: () => {},
  });

  assert.deepEqual(preference.read(), {
    value: "large",
    className: "display-size--large",
  });
});

test("设置页提供标准、大字、特大三档并说明同步调整卡片", () => {
  assert.deepEqual(getDisplaySizeOptions(), [
    {
      value: "standard",
      label: "标准",
      description: "信息更紧凑",
    },
    {
      value: "large",
      label: "大字",
      description: "默认，阅读更轻松",
    },
    {
      value: "extra-large",
      label: "特大",
      description: "文字和卡片更宽松",
    },
  ]);
});
