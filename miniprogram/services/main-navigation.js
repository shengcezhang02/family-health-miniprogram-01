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
    label: "记录",
    icon: "/assets/icons/quick-record.svg",
    tone: "record",
  },
  {
    id: "blood-pressure",
    label: "血压",
    icon: "/assets/icons/quick-blood-pressure.svg",
    tone: "blood-pressure",
  },
  {
    id: "blood-glucose",
    label: "血糖",
    icon: "/assets/icons/quick-blood-glucose.svg",
    tone: "blood-glucose",
  },
  {
    id: "medication",
    label: "用药",
    icon: "/assets/icons/quick-medication.svg",
    tone: "medication",
  },
  {
    id: "care-share",
    label: "分享",
    icon: "/assets/icons/quick-share.svg",
    tone: "share",
  },
  {
    id: "health-template",
    label: "模板",
    icon: "/assets/icons/quick-template.svg",
    tone: "template",
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
    description: "查看筛选后的原始数据，导出 Excel 或保存分析长图",
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

function getQuickAddRoute(actionId, familyId) {
  const encodedFamilyId = encodeURIComponent(familyId || "");
  const systemTemplateIds = {
    "blood-pressure": "sys_blood_pressure",
    "blood-glucose": "sys_blood_glucose",
    medication: "sys_medication",
  };

  if (actionId === "health-item") {
    return `/pages/record-editor/record-editor?familyId=${encodedFamilyId}&from=quick-add`;
  }

  if (systemTemplateIds[actionId]) {
    return `/pages/record-editor/record-editor?familyId=${encodedFamilyId}&templateId=${systemTemplateIds[actionId]}`;
  }

  if (actionId === "care-share") {
    return `/pages/care-share-editor/care-share-editor?familyId=${encodedFamilyId}`;
  }

  if (actionId === "health-template") {
    return `/pages/templates/templates?familyId=${encodedFamilyId}&mode=create`;
  }

  return "";
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
  getQuickAddRoute,
  getQuickAddActions,
  getSelectedNavigationIndex,
  syncMainNavigationSelection,
};
