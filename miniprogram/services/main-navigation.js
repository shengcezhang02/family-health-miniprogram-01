const MAIN_NAVIGATION_ITEMS = [
  {
    id: "records",
    kind: "tab",
    label: "健康记录",
    route: "/pages/records/records",
  },
  {
    id: "daily-health",
    kind: "tab",
    label: "每日健康",
    route: "/pages/daily-health/daily-health",
  },
  {
    id: "quick-add",
    kind: "action",
    label: "+",
  },
  {
    id: "advanced-analysis",
    kind: "tab",
    label: "进阶分析",
    route: "/pages/advanced-analysis/advanced-analysis",
  },
  {
    id: "me-and-family",
    kind: "tab",
    label: "我和家庭",
    route: "/pages/index/index",
  },
];

const QUICK_ADD_ACTIONS = [
  {
    id: "health-item",
    label: "新增健康事项",
  },
  {
    id: "care-share",
    label: "发起关心分享",
  },
  {
    id: "health-template",
    label: "新建健康项目",
  },
];

const ADVANCED_ANALYSIS_ENTRIES = [
  {
    id: "blood-pressure",
    title: "血压分析",
    description: "趋势、平均值、最高值、最低值与参考范围",
  },
  {
    id: "blood-glucose",
    title: "血糖分析",
    description: "按测量场景查看趋势、平均值与时间范围比较",
  },
  {
    id: "medication-completion",
    title: "用药完成分析",
    description: "计划次数、完成次数、完成率与未完成提醒",
  },
  {
    id: "analysis-data-export",
    title: "数据与导出",
    description: "查看筛选后的原始数据，导出 CSV 或保存分析长图",
  },
];

function getMainNavigationItems() {
  return MAIN_NAVIGATION_ITEMS.map((item) => ({ ...item }));
}

function getQuickAddActions() {
  return QUICK_ADD_ACTIONS.map((item) => ({ ...item }));
}

function getAdvancedAnalysisEntries() {
  return ADVANCED_ANALYSIS_ENTRIES.map((item) => ({ ...item }));
}

function getSelectedNavigationIndex(route) {
  const normalizedRoute = route.startsWith("/") ? route : `/${route}`;

  return MAIN_NAVIGATION_ITEMS.findIndex(
    (item) =>
      item.kind === "tab" && item.route === normalizedRoute,
  );
}

function getNextQuickAddVisibility(isOpen) {
  return !isOpen;
}

function syncMainNavigationSelection(page) {
  const selected = getSelectedNavigationIndex(page.route || "");
  const tabBar = page.getTabBar?.();

  if (selected >= 0 && tabBar?.setData) {
    tabBar.setData({ selected });
  }

  return selected;
}

module.exports = {
  getAdvancedAnalysisEntries,
  getMainNavigationItems,
  getNextQuickAddVisibility,
  getQuickAddActions,
  getSelectedNavigationIndex,
  syncMainNavigationSelection,
};
