const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMainNavigationItems,
  getQuickAddActions,
  getAdvancedAnalysisEntries,
  getNextQuickAddVisibility,
  getQuickAddRoute,
  getSelectedNavigationIndex,
  syncMainNavigationSelection,
} = require("../miniprogram/services/main-navigation");

test("主导航按原版文档固定为健康记录、每日健康、+、进阶分析、我和家庭", () => {
  assert.deepEqual(getMainNavigationItems(), [
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
  ]);
});

test("主页面显示时把自定义导航同步到对应位置", () => {
  const updates = [];
  const selected = syncMainNavigationSelection({
    route: "pages/records/records",
    getTabBar() {
      return {
        setData(data) {
          updates.push(data);
        },
      };
    },
  });

  assert.equal(selected, 0);
  assert.deepEqual(updates, [{ selected: 0 }]);
});

test("自定义导航能按当前页面选中四个稳定主页面", () => {
  assert.equal(getSelectedNavigationIndex("pages/records/records"), 0);
  assert.equal(
    getSelectedNavigationIndex("pages/daily-health/daily-health"),
    1,
  );
  assert.equal(
    getSelectedNavigationIndex(
      "pages/advanced-analysis/advanced-analysis",
    ),
    3,
  );
  assert.equal(getSelectedNavigationIndex("pages/index/index"), 4);
  assert.equal(
    getSelectedNavigationIndex("pages/record-editor/record-editor"),
    -1,
  );
});

test("进阶分析只展示原版文档确认的三个预设分析和数据导出", () => {
  assert.deepEqual(getAdvancedAnalysisEntries(), [
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
  ]);
});

test("底部加号第一排直接展示记录、血压、血糖和用药", () => {
  assert.deepEqual(getQuickAddActions(), [
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
  ]);
});

test("中央添加按钮再次点击时关闭快速添加菜单", () => {
  assert.equal(getNextQuickAddVisibility(false), true);
  assert.equal(getNextQuickAddVisibility(true), false);
});

test("快速添加中的分享入口打开关心分享编辑页", () => {
  assert.equal(
    getQuickAddRoute("care-share", "family-1"),
    "/pages/care-share-editor/care-share-editor?familyId=family-1",
  );
});

test("血压、血糖和用药快捷入口直接预选对应系统项目", () => {
  assert.equal(
    getQuickAddRoute("blood-pressure", "family-1"),
    "/pages/record-editor/record-editor?familyId=family-1&templateId=sys_blood_pressure",
  );
  assert.equal(
    getQuickAddRoute("blood-glucose", "family-1"),
    "/pages/record-editor/record-editor?familyId=family-1&templateId=sys_blood_glucose",
  );
  assert.equal(
    getQuickAddRoute("medication", "family-1"),
    "/pages/record-editor/record-editor?familyId=family-1&templateId=sys_medication",
  );
});
