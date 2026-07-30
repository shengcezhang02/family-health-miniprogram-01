const app = getApp();
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  getAdvancedAnalysisEntries,
  syncMainNavigationSelection,
} = require("../../services/main-navigation");

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

Page({
  data: {
    status: "loading",
    familyName: "",
    entries: getAdvancedAnalysisEntries(),
    errorMessage: "",
  },

  onShow() {
    syncMainNavigationSelection(this);
    this.loadFamilyContext({
      silent: this.data.status === "ready",
    });
  },

  onRetry() {
    this.loadFamilyContext();
  },

  onOpenEntry(event) {
    const entry = this.data.entries.find(
      (item) => item.id === event.currentTarget.dataset.entryId,
    );

    if (!entry) {
      return;
    }

    wx.showModal({
      title: entry.title,
      content:
        "入口已按原版文档恢复；分析查询、图表和导出将在后续独立里程碑中实现。",
      showCancel: false,
      confirmText: "知道了",
    });
  },

  async loadFamilyContext({ silent = false } = {}) {
    if (!silent) {
      this.setData({
        status: "loading",
        errorMessage: "",
      });
    }

    try {
      const result = await app.callFamilyApi("bootstrap");
      const family = currentFamilyPreference.resolve(
        result.families || [],
      );

      if (!family) {
        const error = new Error("请先创建或加入家庭");
        error.code = "FAMILY_REQUIRED";
        throw error;
      }

      this.setData({
        status: "ready",
        familyName: family.name,
      });
    } catch (error) {
      if (silent) {
        wx.showToast({
          title: "刷新失败，仍显示上次内容",
          icon: "none",
        });
        return;
      }

      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载进阶分析",
      });
    }
  },
});
