const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  syncMainNavigationSelection,
} = require("../../services/main-navigation");

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

const recordPageLoader = createRecordPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }) =>
    app.callTemplateApi("listTemplates", { familyId }),
  getRecordTimeline: ({ familyId }) =>
    app.callQueryApi("getRecordTimeline", { familyId }),
  resolveCurrentFamily: (families) =>
    currentFamilyPreference.resolve(families),
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(isoString) {
  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimelineItems(items, members) {
  const memberLabelsById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );

  return items.map((item) => ({
    ...item,
    displaySubjectName:
      memberLabelsById.get(item.subject.id) ||
      `${item.subject.displayName}（已退出）`,
    displayOccurredAt: formatDateTime(item.occurredAt),
    displayFields: (item.fieldSchemaSnapshot || [])
      .filter((field) =>
        Object.prototype.hasOwnProperty.call(
          item.values || {},
          field.key,
        ),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((field) => {
        const rawValue = item.values[field.key];
        const choice = (field.options || []).find(
          (option) => option.key === rawValue,
        );

        return {
          key: field.key,
          label: field.label,
          value: `${choice?.label ?? rawValue}${field.unit || ""}`,
        };
      }),
  }));
}

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    items: [],
    errorMessage: "",
    showGoHome: false,
  },

  onLoad(options) {
    this.setData({
      familyId: "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
    });
  },

  onShow() {
    syncMainNavigationSelection(this);
    this.loadTimeline({
      silent: this.data.status === "ready",
    });
  },

  onRetry() {
    this.loadTimeline();
  },

  onGoHome() {
    wx.switchTab({
      url: "/pages/index/index",
    });
  },

  onQuickAdd() {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onSwitchFamily() {
    wx.switchTab({
      url: "/pages/index/index",
    });
  },

  onManageCards() {
    wx.showModal({
      title: "管理卡片",
      content:
        "当前“近期记录”是第一张记录列表卡片。趋势、最新数据、提醒完成、周期提醒以及卡片排序将在 M9 完成。",
      showCancel: false,
      confirmText: "知道了",
    });
  },

  onOpenRecord(event) {
    wx.navigateTo({
      url: `/pages/record-detail/record-detail?recordId=${
        event.currentTarget.dataset.recordId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onOpenDeletedRecords() {
    wx.navigateTo({
      url: `/pages/deleted-records/deleted-records?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onOpenTemplates() {
    wx.navigateTo({
      url: `/pages/templates/templates?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  async loadTimeline({ silent = false } = {}) {
    if (!silent) {
      this.setData({
        status: "loading",
        errorMessage: "",
        showGoHome: false,
      });
    }

    try {
      const result = await recordPageLoader.loadTimeline(
        "",
      );
      this.setData({
        status: "ready",
        familyId: result.family.id,
        familyName: result.family.name,
        items: formatTimelineItems(result.items, result.members),
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
        errorMessage: error.message || "暂时无法加载健康记录",
        showGoHome: error.code === "FAMILY_ACCESS_DENIED",
      });
    }
  },
});
