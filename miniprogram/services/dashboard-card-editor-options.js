const ALL_TEMPLATES_OPTION = {
  id: "",
  name: "全部健康项目",
  fields: [],
};

const TEMPLATE_REQUIRED_CARD_TYPES = new Set([
  "trend",
  "latest_data",
]);

function resolveTemplateSelection({
  cardType,
  templates = [],
  templateId = "",
}) {
  const options = TEMPLATE_REQUIRED_CARD_TYPES.has(cardType)
    ? [...templates]
    : [ALL_TEMPLATES_OPTION, ...templates];
  const matchedIndex = options.findIndex(
    (option) => option.id === templateId,
  );
  const index = matchedIndex >= 0 ? matchedIndex : 0;

  return {
    options,
    index,
    templateId: options[index]?.id || "",
  };
}

module.exports = {
  resolveTemplateSelection,
};
