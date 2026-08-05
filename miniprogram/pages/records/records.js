const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  createDashboardCardStore,
} = require("../../services/dashboard-card-store");
const {
  buildDashboardCardViews,
} = require("../../services/dashboard-card-view");
const {
  buildTrendChart,
  getHealthReferenceLines,
} = require("../../services/trend-chart");
const {
  syncMainNavigationSelection,
} = require("../../services/main-navigation");
const {
  createDisplayPreference,
} = require("../../services/display-preference");
const {
  getHealthItemColorStyles,
  getHealthItemTone,
} = require("../../services/health-item-appearance");

const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "近7天" },
  { value: "30d", label: "近30天" },
  { value: "90d", label: "近90天" },
  { value: "all", label: "全部时间" },
];

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});
const displayPreference = createDisplayPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
});

const dashboardCardStore = createDashboardCardStore({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

const recordPageLoader = createRecordPageLoader({
  bootstrapFamily: (options) =>
    app.callFamilyApi("bootstrap", undefined, options),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }, options) =>
    app.callTemplateApi(
      "listTemplates",
      { familyId },
      options,
    ),
  getRecordTimeline: ({ familyId }) =>
    app.callQueryApi("getRecordTimeline", { familyId }),
  getDashboardData: ({ familyId }, options) =>
    app.callQueryApi(
      "getDashboardData",
      { familyId },
      options,
    ),
  getCachedRecordTimeline: ({ familyId }) =>
    app.getCachedCloudApi("query-api", "getRecordTimeline", {
      familyId,
    }),
  getCachedDashboardData: ({ familyId }) =>
    app.getCachedCloudApi("query-api", "getDashboardData", {
      familyId,
    }),
  getCachedFamilyMembers: ({ familyId }) =>
    app.getCachedCloudApi("profile-api", "listFamilyMembers", {
      familyId,
    }),
  getCachedTemplates: ({ familyId }) =>
    app.getCachedCloudApi("template-api", "listTemplates", {
      familyId,
    }),
  getCachedUserId: () => app.getCachedUserId(),
  peekCurrentFamilyId: () => currentFamilyPreference.peekId(),
  getCachedFamily: (familyId) => app.getCachedFamily(familyId),
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

  return `${date.getMonth() + 1}/${date.getDate()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function formatFieldValue(field, rawValue) {
  const choice = (field.options || []).find(
    (option) => option.key === rawValue,
  );
  return `${choice?.label ?? rawValue}${field.unit || ""}`;
}

function formatTimelineItems(items, members, fieldKeys = []) {
  const memberLabelsById = new Map(
    members.map((member) => [member.id, member.displayLabel]),
  );

  return items.map((item) => ({
    ...item,
    ...getHealthItemColorStyles(
      item.sourceTemplateId,
      item.templateColor,
    ),
    tone: getHealthItemTone(item.sourceTemplateId, item.templateColor),
    displaySubjectName:
      memberLabelsById.get(item.subject.id) ||
      `${item.subject.displayName}（已退出）`,
    displayCreatedByName:
      item.createdBy?.displayName || "家庭成员",
    displayOccurredAt: formatDateTime(item.occurredAt),
    displayCreatedAt: formatDateTime(item.createdAt),
    displayFields: (item.fieldSchemaSnapshot || [])
      .filter(
        (field) =>
          (fieldKeys.length === 0 ||
            fieldKeys.includes(field.key)) &&
          Object.prototype.hasOwnProperty.call(
            item.values || {},
            field.key,
          ),
      )
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: formatFieldValue(field, item.values[field.key]),
      })),
  }));
}

function formatTrendSeries(series, templateId) {
  return series.map((item) => {
    const values = item.points.map((point) => point.value);
    const fieldKey = item.key.slice(item.key.indexOf(":") + 1);
    const references = getHealthReferenceLines(
      templateId,
      fieldKey,
    );
    const chart = buildTrendChart(item.points, references);

    return {
      ...item,
      latestValue: values.length
        ? `${values[values.length - 1]}${item.unit}`
        : "",
      firstTime: chart.xAxis.start
        ? formatDateTime(chart.xAxis.start)
        : "",
      lastTime: chart.xAxis.end
        ? formatDateTime(chart.xAxis.end)
        : "",
      yAxis: chart.yAxis,
      references: chart.references,
      points: chart.points.map((point) => ({
        ...point,
        displayValue: `${point.value}${item.unit}`,
        displayTime: formatDateTime(point.occurredAt),
      })),
    };
  });
}

function formatCardViews(views, members) {
  return views.map((view) => {
    const baseView = {
      ...view,
      ...getHealthItemColorStyles(
        view.templateId,
        view.templateColor,
      ),
      tone: getHealthItemTone(view.templateId, view.templateColor),
    };

    if (view.type === "record_list") {
      return {
        ...baseView,
        items: formatTimelineItems(
          view.items,
          members,
          view.fieldKeys,
        ),
      };
    }

    if (view.type === "latest_data") {
      return {
        ...baseView,
        items: view.items.map((item) => ({
          ...item,
          ...getHealthItemColorStyles(
            item.sourceTemplateId,
            item.templateColor,
          ),
          displayOccurredAt: formatDateTime(
            item.record.occurredAt,
          ),
          values: item.values.map((value) => ({
            ...value,
            displayValue: `${value.value}${value.unit}`,
            changeLabel:
              value.change === undefined
                ? "暂无上次数据"
                : value.change === 0
                  ? "与上次相同"
                  : `较上次${value.change > 0 ? "+" : ""}${
                      value.change
                    }${value.unit}`,
          })),
        })),
      };
    }

    if (view.type === "trend") {
      return {
        ...baseView,
        series: formatTrendSeries(view.series, view.templateId),
      };
    }

    if (view.type === "reminder_completion") {
      return {
        ...baseView,
        items: view.items.map((item) => ({
          ...item,
          tone: getHealthItemTone(
            item.sourceTemplateId,
            item.templateColor,
          ),
          displayPlannedAt: formatDateTime(item.plannedAt),
          displayNotificationTimes: (item.notificationTimes || [])
            .map(formatDateTime)
            .join("、"),
          displayCreatedAt: formatDateTime(item.createdAt),
          displayCreatedByName:
            item.createdBy?.displayName || "家庭成员",
        })),
      };
    }

    return baseView;
  });
}

Page({
  data: {
    status: "loading",
    userId: "",
    familyId: "",
    familyName: "当前家庭",
    cards: [],
    quickMemberOptions: [],
    timeRangeOptions: TIME_RANGE_OPTIONS,
    refreshing: false,
    interactionsLocked: true,
    cacheNotice: "",
    errorMessage: "",
    showGoHome: false,
    displaySizeClass: "display-size--large",
  },

  onLoad() {
    const startupSnapshot =
      recordPageLoader.getDashboardStartupSnapshot();

    if (startupSnapshot) {
      this.applyDashboardResult(startupSnapshot, {
        fromCache: true,
      });
    }
  },

  onShow() {
    syncMainNavigationSelection(this);
    this.setData({
      displaySizeClass: displayPreference.read().className,
    });

    if (this.data.status === "ready") {
      this.refreshLocalCards();
    }

    this.loadDashboard({
      silent: this.data.status === "ready",
    });
  },

  async onPullDownRefresh() {
    try {
      await this.loadDashboard({
        silent: true,
        fresh: true,
      });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onRetry() {
    this.loadDashboard({ fresh: true });
  },

  onGoHome() {
    wx.switchTab({
      url: "/pages/index/index",
    });
  },

  onQuickAdd() {
    if (this.data.interactionsLocked) {
      wx.showToast({
        title: "云端更新完成后才能修改",
        icon: "none",
      });
      return;
    }

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
    if (!this.data.userId || !this.data.familyId) {
      return;
    }

    wx.navigateTo({
      url: `/pages/dashboard-cards/dashboard-cards?userId=${
        this.data.userId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onOpenCard(event) {
    wx.navigateTo({
      url: `/pages/dashboard-card-editor/dashboard-card-editor?userId=${
        this.data.userId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&cardId=${event.currentTarget.dataset.cardId}`,
    });
  },

  onQuickMemberChange(event) {
    const cardId = event.currentTarget.dataset.cardId;
    const selected =
      this.data.quickMemberOptions[Number(event.detail.value)];

    if (!selected) {
      return;
    }

    dashboardCardStore.update(this.getScope(), cardId, {
      memberIds: selected.id ? [selected.id] : [],
    });
    this.refreshLocalCards();
  },

  onQuickTimeRangeChange(event) {
    const cardId = event.currentTarget.dataset.cardId;
    const selected =
      TIME_RANGE_OPTIONS[Number(event.detail.value)];

    if (!selected) {
      return;
    }

    dashboardCardStore.update(this.getScope(), cardId, {
      timeRange: selected.value,
    });
    this.refreshLocalCards();
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
    const reminderId = event.currentTarget.dataset.reminderId;
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&mode=reminder&reminderId=${reminderId}`,
    });
  },

  onOpenRule(event) {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&mode=recurring&ruleId=${
        event.currentTarget.dataset.ruleId
      }`,
    });
  },

  onOpenDeletedRecords() {
    wx.navigateTo({
      url: `/pages/deleted-records/deleted-records?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  getScope() {
    return {
      userId: this.data.userId,
      familyId: this.data.familyId,
    };
  },

  refreshLocalCards() {
    if (!this._dashboardData || !this.data.userId) {
      return;
    }

    const cards = dashboardCardStore.initialize(this.getScope());
    const views = buildDashboardCardViews({
      cards,
      dashboardData: this._dashboardData,
      members: this._members,
    });

    this.setData({
      cards: formatCardViews(views, this._members),
    });
  },

  async loadDashboard({ silent = false, fresh = false } = {}) {
    if (!silent && this.data.status !== "ready") {
      this.setData({
        status: "loading",
        interactionsLocked: true,
        errorMessage: "",
        showGoHome: false,
      });
    } else {
      this.setData({
        refreshing: true,
        interactionsLocked: true,
        cacheNotice: "正在更新云端数据，完成前只能查看",
      });
    }

    let showedCachedData = false;

    try {
      const result = await recordPageLoader.loadDashboard("", {
        fresh,
        onCached: (cachedResult) => {
          showedCachedData = true;
          this.applyDashboardResult(cachedResult, {
            fromCache: true,
          });
        },
      });
      this.applyDashboardResult(result);
    } catch (error) {
      if (
        showedCachedData ||
        silent ||
        this.data.status === "ready"
      ) {
        this.setData({
          status: "ready",
          refreshing: false,
          interactionsLocked: true,
          cacheNotice: "云端更新失败，当前缓存仅供查看",
        });
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

  applyDashboardResult(result, { fromCache = false } = {}) {
    this._dashboardData = {
      records: result.records || [],
      reminders: result.reminders || [],
      recurringRules: result.recurringRules || [],
    };
    this._members = result.members || [];
    this._templates = result.templates || [];

    const scope = {
      userId: result.userId,
      familyId: result.family.id,
    };
    const cards = dashboardCardStore.initialize(scope);
    const views = buildDashboardCardViews({
      cards,
      dashboardData: this._dashboardData,
      members: this._members,
    });

    this.setData({
      status: "ready",
      userId: result.userId,
      familyId: result.family.id,
      familyName: result.family.name,
      cards: formatCardViews(views, this._members),
      quickMemberOptions: [
        { id: "", label: "全部成员" },
        ...this._members.map((member) => ({
          id: member.id,
          label: member.displayLabel,
        })),
      ],
      refreshing: fromCache,
      interactionsLocked: fromCache,
      cacheNotice: fromCache
        ? "正在更新云端数据，完成前只能查看"
        : "",
    });
  },
});
