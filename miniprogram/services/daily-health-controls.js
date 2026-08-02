function toggleDailyControls(expanded) {
  return !expanded;
}

function buildDailyControlsSummary({
  memberLabel,
  templateLabel,
  itemTypeLabel,
  displayMode,
}) {
  return [
    memberLabel,
    templateLabel,
    itemTypeLabel,
    displayMode === "grouped" ? "分类" : "混排",
  ]
    .filter(Boolean)
    .join(" · ");
}

module.exports = {
  buildDailyControlsSummary,
  toggleDailyControls,
};

