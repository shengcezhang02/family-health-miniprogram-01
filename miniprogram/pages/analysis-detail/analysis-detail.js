const app = getApp();
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  createAnalysisPageLoader,
} = require("../../services/analysis-page-loader");
const {
  buildAnalysisView,
} = require("../../services/analysis-view");
const {
  buildAnalysisShareImage,
  buildShareChartGeometry,
  waitForCanvasDraw,
} = require("../../services/analysis-share-image");
const {
  buildAnalysisChartSeries,
} = require("../../services/analysis-chart");
const {
  formatDateTime,
} = require("../../services/analysis-export");

const TITLES = {
  blood_pressure: "血压分析",
  blood_glucose: "血糖分析",
  medication: "用药完成分析",
};
const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "90d", label: "近 90 天" },
  { value: "all", label: "全部时间" },
];
const SCENE_OPTIONS = [
  { value: "all", label: "全部场景" },
  { value: "fasting", label: "空腹" },
  { value: "before_meal", label: "餐前" },
  { value: "after_meal_2h", label: "餐后 2 小时" },
  { value: "bedtime", label: "睡前" },
  { value: "random", label: "随机" },
  { value: "unclassified", label: "未分类" },
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

function formatSeries(view) {
  return buildAnalysisChartSeries(view).map((item, seriesIndex) => {
    const points = item.points || [];
    return {
      ...item,
      colorClass: `trend-series--${seriesIndex}`,
      latestValue: points.length
        ? `${points[points.length - 1].value} ${item.unit}`
        : "",
      firstTime: item.xAxis.start
        ? formatDateTime(item.xAxis.start)
        : "",
      lastTime: item.xAxis.end
        ? formatDateTime(item.xAxis.end)
        : "",
      points: points.map((point) => ({
        ...point,
        displayValue: `${point.value} ${item.unit}`,
      })),
    };
  });
}

function formatRecord(record) {
  let valueLabel = "";

  if (record.analysisType === "blood_pressure") {
    valueLabel = `${record.values.systolic}/${record.values.diastolic} mmHg`;
  } else if (record.analysisType === "blood_glucose") {
    valueLabel = `${record.values.glucose} mmol/L`;
  } else {
    valueLabel = [
      record.values.medicineName,
      record.values.dosage,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return {
    ...record,
    displayTime: formatDateTime(record.occurredAt),
    valueLabel,
  };
}

function formatReminder(reminder) {
  return {
    ...reminder,
    displayTime: formatDateTime(reminder.plannedAt),
    valueLabel: [
      reminder.values.medicineName,
      reminder.values.dosage,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function buildDisplayView(view) {
  return {
    ...view,
    metricsList: Object.values(view.metrics || {}),
    sceneGroups: view.sceneGroups || [],
    series: formatSeries(view),
    records: (view.records || []).map(formatRecord).reverse(),
    history: (view.history || []).map(formatRecord),
    incompleteReminders: (view.incompleteReminders || []).map(
      formatReminder,
    ),
  };
}

Page({
  data: {
    status: "loading",
    type: "blood_pressure",
    title: "进阶分析",
    familyId: "",
    familyName: "当前家庭",
    memberOptions: [{ id: "", label: "全部成员" }],
    memberIndex: 0,
    timeRangeOptions: TIME_RANGE_OPTIONS,
    timeRangeIndex: 1,
    sceneOptions: SCENE_OPTIONS,
    sceneIndex: 0,
    view: null,
    cacheNotice: "",
    errorMessage: "",
    savingImage: false,
    canvasWidth: 720,
    canvasHeight: 1100,
  },

  onLoad(options) {
    const type = TITLES[options.type]
      ? options.type
      : "blood_pressure";
    this.setData({ type, title: TITLES[type] });
    wx.setNavigationBarTitle({ title: TITLES[type] });

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

  onMemberChange(event) {
    this.setData({ memberIndex: Number(event.detail.value) });
    this.refreshView();
  },

  onTimeRangeChange(event) {
    this.setData({ timeRangeIndex: Number(event.detail.value) });
    this.refreshView();
  },

  onSceneChange(event) {
    this.setData({ sceneIndex: Number(event.detail.value) });
    this.refreshView();
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

  onOpenReminder(event) {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&mode=reminder&reminderId=${
        event.currentTarget.dataset.reminderId
      }`,
    });
  },

  onOpenData() {
    wx.navigateTo({
      url: `/pages/analysis-data/analysis-data?type=${this.data.type}`,
    });
  },

  getFilters() {
    const member = this.data.memberOptions[this.data.memberIndex];
    return {
      memberIds: member?.id ? [member.id] : [],
      timeRange:
        TIME_RANGE_OPTIONS[this.data.timeRangeIndex]?.value || "30d",
      measurementScene:
        SCENE_OPTIONS[this.data.sceneIndex]?.value || "all",
    };
  },

  refreshView() {
    if (!this._analysisData) {
      return;
    }

    const rawView = buildAnalysisView({
      type: this.data.type,
      analysisData: this._analysisData,
      filters: this.getFilters(),
    });
    this._rawView = rawView;
    this.setData({ view: buildDisplayView(rawView) });
  },

  async loadData({ silent = false, fresh = false } = {}) {
    if (!silent && this.data.status !== "ready") {
      this.setData({
        status: "loading",
        errorMessage: "",
      });
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
        errorMessage: error.message || "暂时无法加载分析数据",
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
      familyId: result.family.id,
      familyName: result.family.name,
      memberOptions,
      memberIndex,
      cacheNotice: fromCache ? "正在更新云端数据…" : "",
    });
    this.refreshView();
  },

  drawShareImage(model) {
    const ctx = wx.createCanvasContext("analysis-share-canvas", this);
    const width = this.data.canvasWidth;
    const height = this.data.canvasHeight;
    let y = 78;

    ctx.setFillStyle("#f4f1eb");
    ctx.fillRect(0, 0, width, height);
    ctx.setFillStyle("#202825");
    ctx.setFontSize(42);
    ctx.fillText(model.title, 52, y);
    y += 46;
    ctx.setFillStyle("#66716d");
    ctx.setFontSize(20);
    ctx.fillText(model.filterLine.slice(0, 34), 52, y);
    y += 45;

    ctx.setFillStyle("#ffffff");
    ctx.fillRect(38, y, width - 76, 220);
    ctx.setFillStyle("#2d3b36");
    ctx.setFontSize(24);
    model.summaryLines.forEach((line, index) => {
      ctx.fillText(line.slice(0, 36), 62, y + 50 + index * 52);
    });
    y += 255;

    if (model.chartSeries.some((series) => series.points.length)) {
      const plotX = 102;
      const plotY = y + 76;
      const plotWidth = width - 158;
      const plotHeight = 230;
      const geometry = buildShareChartGeometry(model.chartSeries, {
        width: plotWidth,
        height: plotHeight,
      });

      ctx.setFillStyle("#ffffff");
      ctx.fillRect(38, y, width - 76, 375);
      ctx.setFontSize(19);
      ctx.setTextAlign("left");
      geometry.series.forEach((series, index) => {
        const legendX = 62 + index * 180;
        ctx.setFillStyle(series.color);
        ctx.fillRect(legendX, y + 28, 24, 5);
        ctx.setFillStyle("#4b5752");
        ctx.fillText(series.label, legendX + 34, y + 36);
      });

      ctx.setStrokeStyle("#e7e2db");
      ctx.setLineWidth(1);
      geometry.yAxis.forEach((tick) => {
        ctx.beginPath();
        ctx.moveTo(plotX, plotY + tick.y);
        ctx.lineTo(plotX + plotWidth, plotY + tick.y);
        ctx.stroke();
      });

      ctx.setFillStyle("#7b8581");
      ctx.setFontSize(16);
      ctx.setTextAlign("right");
      geometry.yAxis.forEach((tick) => {
        ctx.fillText(String(tick.value), plotX - 12, plotY + tick.y + 5);
      });

      geometry.references.forEach((reference) => {
        ctx.setStrokeStyle(reference.color || "#9a6a5f");
        ctx.setLineWidth(2);
        for (let offset = 0; offset < plotWidth; offset += 16) {
          ctx.beginPath();
          ctx.moveTo(plotX + offset, plotY + reference.y);
          ctx.lineTo(
            plotX + Math.min(offset + 9, plotWidth),
            plotY + reference.y,
          );
          ctx.stroke();
        }
        ctx.setFillStyle(reference.color || "#9a6a5f");
        ctx.setTextAlign("right");
        ctx.fillText(
          reference.label,
          plotX + plotWidth - 4,
          plotY + reference.y - 7,
        );
      });

      geometry.series.forEach((series) => {
        ctx.setStrokeStyle(series.color);
        ctx.setLineWidth(4);
        ctx.beginPath();
        series.points.forEach((point, index) => {
          const pointX = plotX + point.x;
          const pointY = plotY + point.y;
          if (index === 0) {
            ctx.moveTo(pointX, pointY);
          } else {
            ctx.lineTo(pointX, pointY);
          }
        });
        ctx.stroke();

        ctx.setTextAlign("center");
        ctx.setFontSize(16);
        series.points.forEach((point) => {
          const pointX = plotX + point.x;
          const pointY = plotY + point.y;
          ctx.setFillStyle(series.color);
          ctx.beginPath();
          ctx.arc(pointX, pointY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillText(
            point.valueLabel,
            pointX,
            pointY + point.labelOffsetY,
          );
        });
      });

      ctx.setFillStyle("#7b8581");
      ctx.setFontSize(16);
      ctx.setTextAlign("left");
      ctx.fillText(
        formatDateTime(geometry.xAxis.start),
        plotX,
        plotY + plotHeight + 27,
      );
      ctx.setTextAlign("center");
      ctx.fillText(
        "时间",
        plotX + plotWidth / 2,
        plotY + plotHeight + 27,
      );
      ctx.setTextAlign("right");
      ctx.fillText(
        formatDateTime(geometry.xAxis.end),
        plotX + plotWidth,
        plotY + plotHeight + 27,
      );
      ctx.setTextAlign("left");
      y += 410;
    }

    ctx.setFillStyle("#5f6c67");
    ctx.setFontSize(20);
    model.noticeLines.forEach((line, index) => {
      ctx.fillText(line.slice(0, 40), 52, y + index * 38);
    });
    ctx.setFillStyle("#a35c50");
    ctx.setFontSize(18);
    ctx.fillText("由家庭健康小程序生成", 52, height - 55);

    return waitForCanvasDraw((done) => ctx.draw(false, done));
  },

  async onSaveImage() {
    if (this.data.savingImage || !this._rawView) {
      return;
    }

    this.setData({ savingImage: true });
    try {
      const model = buildAnalysisShareImage({
        familyName: this.data.familyName,
        memberLabel:
          this.data.memberOptions[this.data.memberIndex]?.label ||
          "全部成员",
        timeRangeLabel:
          TIME_RANGE_OPTIONS[this.data.timeRangeIndex]?.label ||
          "近 30 天",
        view: this._rawView,
      });
      await this.drawShareImage(model);
      const image = await new Promise((resolve, reject) => {
        wx.canvasToTempFilePath(
          {
            canvasId: "analysis-share-canvas",
            width: this.data.canvasWidth,
            height: this.data.canvasHeight,
            destWidth: this.data.canvasWidth * 2,
            destHeight: this.data.canvasHeight * 2,
            fileType: "png",
            success: resolve,
            fail: reject,
          },
          this,
        );
      });
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: image.tempFilePath,
          success: resolve,
          fail: reject,
        });
      });
      wx.showToast({ title: "分析长图已保存", icon: "success" });
    } catch (error) {
      wx.showModal({
        title: "保存失败",
        content:
          error.errMsg?.includes("auth deny") ||
          error.errMsg?.includes("authorize")
            ? "请在小程序设置中允许保存到相册后重试。"
            : "暂时无法保存分析长图，请稍后重试。",
        showCancel: false,
      });
    } finally {
      this.setData({ savingImage: false });
    }
  },
});
