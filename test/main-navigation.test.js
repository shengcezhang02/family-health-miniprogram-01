const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMainNavigationItems,
  getQuickAddActions,
  getAdvancedAnalysisEntries,
  getNextQuickAddVisibility,
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
      description: "查看筛选后的原始数据，导出 CSV 或保存分析长图",
    },
  ]);
});

test("底部加号打开原版文档定义的三个全局添加入口", () => {
  assert.deepEqual(getQuickAddActions(), [
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
  ]);
});

test("中央添加按钮再次点击时关闭快速添加菜单", () => {
  assert.equal(getNextQuickAddVisibility(false), true);
  assert.equal(getNextQuickAddVisibility(true), false);
});
