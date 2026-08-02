const app = getApp();
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  createAnalysisPageLoader,
} = require("../../services/analysis-page-loader");
const {
  buildAnalysisRows,
} = require("../../services/analysis-export");
const {
  buildAnalysisXlsx,
} = require("../../services/analysis-xlsx");
const {
  exportXlsxFile,
} = require("../../services/xlsx-file-export");

const PROJECT_OPTIONS = [
  { value: "", label: "全部分析项目" },
  { value: "blood_pressure", label: "血压" },
  { value: "blood_glucose", label: "血糖" },
  { value: "medication", label: "用药" },
];
const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
  { value: "all", label: "全部时间" },
];

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

const analysisPageLoader = createAnalysisPageLoader({
  bootstrapFamily: (options) =>
    app.callFamilyApi("bootstrap", undefined, options),
  getAnalysisData: (data, options) =>
    app.callQueryApi("getAnalysisData", data, options),
  resolveCurrentFamily: (families) =>
    currentFamilyPreference.resolve(families),
  getCachedAnalysisData: (data) =>
    app.getCachedCloudApi("query-api", "getAnalysisData", data),
  getCachedUserId: () => app.getCachedUserId(),
  peekCurrentFamilyId: () => currentFamilyPreference.peekId(),
  getCachedFamily: (familyId) => app.getCachedFamily(familyId),
});

function getRowDetail(row) {
  if (row.type === "血压记录") {
    return `${row.systolic}/${row.diastolic} mmHg`;
  }

  if (row.type === "血糖记录") {
    return `${row.glucose} mmol/L · ${row.measurementScene}`;
  }

  return [row.medicineName, row.dosage, row.status]
    .filter(Boolean)
    .join(" · ");
}

Page({
  data: {
    status: "loading",
    familyName: "当前家庭",
    projectOptions: PROJECT_OPTIONS,
    projectIndex: 0,
    memberOptions: [{ id: "", label: "全部成员" }],
    memberIndex: 0,
    timeRangeOptions: TIME_RANGE_OPTIONS,
    timeRangeIndex: 1,
    rows: [],
    cacheNotice: "",
    errorMessage: "",
    exporting: false,
  },

  onLoad(options) {
    const projectIndex = Math.max(
      PROJECT_OPTIONS.findIndex((item) => item.value === options.type),
      0,
    );
    this.setData({ projectIndex });

    const snapshot = analysisPageLoader.getStartupSnapshot();
    if (snapshot) {
      this.applyResult(snapshot, { fromCache: true });
    }
  },

  onShow() {
    this.loadData({ silent: this.data.status === "ready" });
  },

  async onPullDownRefresh() {
    try {
      await this.loadData({ silent: true, fresh: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onRetry() {
    this.loadData({ fresh: true });
  },

  onProjectChange(event) {
    this.setData({ projectIndex: Number(event.detail.value) });
    this.refreshRows();
  },

  onMemberChange(event) {
    this.setData({ memberIndex: Number(event.detail.value) });
    this.refreshRows();
  },

  onTimeRangeChange(event) {
    this.setData({ timeRangeIndex: Number(event.detail.value) });
    this.refreshRows();
  },

  getFilters() {
    const member = this.data.memberOptions[this.data.memberIndex];
    return {
      memberIds: member?.id ? [member.id] : [],
      timeRange:
        TIME_RANGE_OPTIONS[this.data.timeRangeIndex]?.value || "30d",
      measurementScene: "all",
    };
  },

  getSelectedType() {
    return PROJECT_OPTIONS[this.data.projectIndex]?.value || undefined;
  },

  refreshRows() {
    if (!this._analysisData) {
      return;
    }

    const rows = buildAnalysisRows({
      type: this.getSelectedType(),
      analysisData: this._analysisData,
      filters: this.getFilters(),
    }).map((row, index) => ({
      ...row,
      rowKey: `${row.type}-${row.member}-${row.time}-${index}`,
      detail: getRowDetail(row),
    }));

    this.setData({ rows });
  },

  async loadData({ silent = false, fresh = false } = {}) {
    if (!silent && this.data.status !== "ready") {
      this.setData({ status: "loading", errorMessage: "" });
    } else {
      this.setData({ cacheNotice: "正在更新云端数据…" });
    }

    let showedCache = false;
    try {
      const result = await analysisPageLoader.load({
        fresh,
        onCached: (cached) => {
          showedCache = true;
          this.applyResult(cached, { fromCache: true });
        },
      });
      this.applyResult(result);
    } catch (error) {
      if (showedCache || silent || this.data.status === "ready") {
        this.setData({ cacheNotice: "云端更新失败，当前显示缓存" });
        wx.showToast({
          title: "刷新失败，仍显示上次内容",
          icon: "none",
        });
        return;
      }
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载原始数据",
      });
    }
  },

  applyResult(result, { fromCache = false } = {}) {
    this._analysisData = {
      records: result.records || [],
      medicationReminders: result.medicationReminders || [],
    };
    const memberOptions = [
      { id: "", label: "全部成员" },
      ...(result.members || []).map((member) => ({
        id: member.id,
        label: member.displayLabel,
      })),
    ];
    const selectedMemberId =
      this.data.memberOptions[this.data.memberIndex]?.id || "";
    const memberIndex = Math.max(
      memberOptions.findIndex((member) => member.id === selectedMemberId),
      0,
    );

    this.setData({
      status: "ready",
      familyName: result.family.name,
      memberOptions,
      memberIndex,
      cacheNotice: fromCache ? "正在更新云端数据…" : "",
    });
    this.refreshRows();
  },

  async onExportXlsx() {
    if (this.data.exporting || this.data.rows.length === 0) {
      if (this.data.rows.length === 0) {
        wx.showToast({ title: "当前筛选没有可导出数据", icon: "none" });
      }
      return;
    }

    this.setData({ exporting: true });
    try {
      const workbook = buildAnalysisXlsx({
        type: this.getSelectedType(),
        analysisData: this._analysisData,
        filters: this.getFilters(),
      });
      await exportXlsxFile({
        workbook,
        userDataPath: wx.env.USER_DATA_PATH,
        writeFile: (options) =>
          new Promise((resolve, reject) => {
            wx.getFileSystemManager().writeFile({
              ...options,
              success: resolve,
              fail: reject,
            });
          }),
        openDocument: (options) =>
          new Promise((resolve, reject) => {
            wx.openDocument({
              ...options,
              success: resolve,
              fail: reject,
            });
          }),
      });
    } catch (error) {
      const message =
        error.errMsg || error.message || "微信未返回具体原因";
      console.error("[XLSX_EXPORT_FAILED]", message);
      wx.showModal({
        title: "Excel 导出失败",
        content: message.slice(0, 160),
        showCancel: false,
      });
    } finally {
      this.setData({ exporting: false });
    }
  },
});
