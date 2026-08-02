const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveTemplateSelection,
} = require("../miniprogram/services/dashboard-card-editor-options");

const templates = [
  { id: "sys_temperature", name: "体温", fields: [] },
  { id: "sys_weight", name: "体重", fields: [] },
];

test("趋势卡片只提供具体健康项目，并在原先选择全部时自动选择第一项", () => {
  const selection = resolveTemplateSelection({
    cardType: "trend",
    templates,
    templateId: "",
  });

  assert.deepEqual(
    selection.options.map((option) => option.id),
    ["sys_temperature", "sys_weight"],
  );
  assert.equal(selection.index, 0);
  assert.equal(selection.templateId, "sys_temperature");
});
