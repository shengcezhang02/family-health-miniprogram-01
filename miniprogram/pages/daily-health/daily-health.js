const app = getApp();
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  createDailyHealthPageLoader,
} = require("../../services/daily-health-page-loader");
const {
  getDailyDatePresentation,
  shiftDailyDate,
  toLocalDateString,
} = require("../../services/daily-health-date");
const {
  syncMainNavigationSelection,
} = require("../../services/main-navigation");
const {
  buildDailyHealthView,
  normalizeDailyDisplayMode,
} = require("../../services/daily-health-view");
const {
  formatNotificationTimeSummary,
} = require("../../services/reminder-notification-times");
const {
  getReminderCardTarget,
} = require("../../services/daily-health-navigation");
const {
  buildDailyControlsSummary,
  toggleDailyControls,
} = require("../../services/daily-health-controls");

const DAILY_DISPLAY_MODE_KEY = "daily-health-display-mode";

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

const loader = createDailyHealthPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  resolveCurrentFamily: (families) =>
    currentFamilyPreference.resolve(families),
  getDailyHealth: (data) =>
    app.callQueryApi("getDailyHealth", data),
  getCachedDailyHealth: (data) =>
    app.getCachedCloudApi("query-api", "getDailyHealth", data),
  peekCurrentFamilyId: () => currentFamilyPreference.peekId(),
  getCachedFamily: (familyId) =>
    app.getCachedFamily(familyId),
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime())
    ? ""
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDateDisplayData(date, todayDate) {
  const presentation = getDailyDatePresentation(date, todayDate);
  return {
    dateTitle: presentation.title,
    dateSubtitle: presentation.subtitle,
  };
}

function formatFields(item) {
  return (item.fieldSchemaSnapshot || [])
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
    });
}

function formatReminders(reminders) {
  return reminders.map((reminder) => ({
    ...reminder,
    displayPlannedAt: formatTime(reminder.plannedAt),
    displayNotificationTimes: formatNotificationTimeSummary(
      reminder.notificationTimes,
    ),
    displaySubjectName: reminder.subject.displayName,
    displayFields: formatFields(reminder),
    canCheckIn:
      reminder.status === "pending" && reminder.subjectIsActive,
  }));
}

function formatRecords(records) {
  return records.map((record) => ({
    ...record,
    displayOccurredAt: formatTime(record.occurredAt),
    displaySubjectName: record.subject.displayName,
    displayFields: formatFields(record),
  }));
}

function formatRuleRepeat(repeat) {
  if (repeat.type === "daily") {
    return "每天";
  }

  if (repeat.type === "weekly") {
    const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
    return `每周${repeat.weekdays
      .map((weekday) => weekdayLabels[weekday - 1])
      .join("、")}`;
  }

  return `每隔 ${repeat.intervalDays} 天`;
}

function formatRecurringRules(recurringRules) {
  return recurringRules.map((rule) => ({
    ...rule,
    displaySubjectName: rule.subject.displayName,
    displayRepeat: formatRuleRepeat(rule.repeat),
    displayDailyTimes: rule.dailyTimes.join("、"),
    displayStatus:
      rule.status === "paused" ? "已暂停" : rule.datePhase,
  }));
}

function createTemplateOptions(records, reminders, recurringRules) {
  const templatesById = new Map();

  for (const item of records.concat(reminders, recurringRules)) {
    if (!templatesById.has(item.sourceTemplateId)) {
      templatesById.set(item.sourceTemplateId, {
        id: item.sourceTemplateId,
        label: item.templateNameSnapshot,
      });
    }
  }

  return [
    {
      id: "all",
      label: "全部项目",
    },
    ...templatesById.values(),
  ];
}

Page({
  data: {
    status: "loading",
    date: "",
    dateTitle: "",
    dateSubtitle: "",
    todayDate: "",
    familyId: "",
    familyName: "",
    reminders: [],
    records: [],
    recurringRules: [],
    timelineItems: [],
    memberOptions: [
      {
        id: "all",
        label: "全部成员",
      },
    ],
    templateOptions: [
      {
        id: "all",
        label: "全部项目",
      },
    ],
    itemTypeOptions: [
      {
        id: "all",
        label: "全部类型",
      },
      {
        id: "record",
        label: "记录",
      },
      {
        id: "reminder",
        label: "一次性提醒",
      },
      {
        id: "rule",
        label: "周期规则",
      },
    ],
    selectedMemberFilterIndex: 0,
    selectedTemplateFilterIndex: 0,
    selectedItemTypeFilterIndex: 0,
    memberFilterId: "all",
    templateFilterId: "all",
    itemTypeFilter: "all",
    displayMode: "mixed",
    controlsExpanded: false,
    controlsSummary: "全部成员 · 全部项目 · 全部类型 · 混排",
    showDeveloperTools: false,
    runningMaterializer: false,
    refreshing: false,
    interactionsLocked: true,
    cacheNotice: "",
    errorMessage: "",
    showGoFamily: false,
  },

  onLoad() {
    const todayDate = toLocalDateString(new Date());
    let showDeveloperTools = false;

    try {
      showDeveloperTools =
        wx.getAccountInfoSync().miniProgram.envVersion === "develop";
    } catch (error) {
      console.warn("无法识别当前小程序环境", error);
    }

    const displayMode = normalizeDailyDisplayMode(
      wx.getStorageSync(DAILY_DISPLAY_MODE_KEY),
    );
    this.setData({
      date: todayDate,
      todayDate,
      ...getDateDisplayData(todayDate, todayDate),
      displayMode,
      showDeveloperTools,
    });
    this.refreshControlsSummary();

    const startupSnapshot =
      loader.getStartupSnapshot(todayDate);
    if (startupSnapshot) {
      this.applyDailyResult(startupSnapshot, {
        fromCache: true,
      });
    }
  },

  onShow() {
    syncMainNavigationSelection(this);
    if (this.data.date) {
      this.loadDailyHealth({
        silent: this.data.status === "ready",
      });
    }
  },

  onDateChange(event) {
    this.selectDate(event.detail.value);
  },

  onPreviousDate() {
    this.selectDate(shiftDailyDate(this.data.date, -1));
  },

  onNextDate() {
    this.selectDate(shiftDailyDate(this.data.date, 1));
  },

  onToday() {
    this.selectDate(this.data.todayDate);
  },

  onToggleControls() {
    this.setData({
      controlsExpanded: toggleDailyControls(
        this.data.controlsExpanded,
      ),
    });
  },

  refreshControlsSummary() {
    this.setData({
      controlsSummary: buildDailyControlsSummary({
        memberLabel:
          this.data.memberOptions[
            this.data.selectedMemberFilterIndex
          ]?.label,
        templateLabel:
          this.data.templateOptions[
            this.data.selectedTemplateFilterIndex
          ]?.label,
        itemTypeLabel:
          this.data.itemTypeOptions[
            this.data.selectedItemTypeFilterIndex
          ]?.label,
        displayMode: this.data.displayMode,
      }),
    });
  },

  selectDate(date) {
    if (!date || date === this.data.date) {
      return;
    }

    const cachedDailyHealth = this.data.familyId
      ? app.getCachedCloudApi(
          "query-api",
          "getDailyHealth",
          {
            familyId: this.data.familyId,
            date,
          },
        )
      : undefined;

    this.setData({
      date,
      ...getDateDisplayData(date, this.data.todayDate),
    });

    if (cachedDailyHealth) {
      this.applyDailyResult(
        {
          family: {
            id: this.data.familyId,
            name: this.data.familyName,
          },
          members: cachedDailyHealth.members || [],
          records: cachedDailyHealth.records || [],
          reminders: cachedDailyHealth.reminders || [],
          recurringRules:
            cachedDailyHealth.recurringRules || [],
        },
        {
          fromCache: true,
        },
      );
    } else {
      this._dailyData = {
        records: [],
        reminders: [],
        recurringRules: [],
      };
      this.setData({
        status: "ready",
        records: [],
        reminders: [],
        recurringRules: [],
        timelineItems: [],
        refreshing: true,
        interactionsLocked: true,
        cacheNotice: "正在更新云端数据，完成前只能查看",
      });
    }

    this.loadDailyHealth({
      silent: true,
    });
  },

  onRetry() {
    this.loadDailyHealth();
  },

  onGoFamily() {
    wx.switchTab({
      url: "/pages/index/index",
    });
  },

  onAddReminder() {
    if (!this.ensureFreshForWrite()) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=reminder&familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onAddRecord() {
    if (!this.ensureFreshForWrite()) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onMemberFilterChange(event) {
    const selectedMemberFilterIndex = Number(event.detail.value);
    this.setData(
      {
        selectedMemberFilterIndex,
        memberFilterId:
          this.data.memberOptions[selectedMemberFilterIndex].id,
      },
      () => {
        this.applyView();
        this.refreshControlsSummary();
      },
    );
  },

  onTemplateFilterChange(event) {
    const selectedTemplateFilterIndex = Number(event.detail.value);
    this.setData(
      {
        selectedTemplateFilterIndex,
        templateFilterId:
          this.data.templateOptions[selectedTemplateFilterIndex].id,
      },
      () => {
        this.applyView();
        this.refreshControlsSummary();
      },
    );
  },

  onItemTypeFilterChange(event) {
    const selectedItemTypeFilterIndex = Number(event.detail.value);
    this.setData(
      {
        selectedItemTypeFilterIndex,
        itemTypeFilter:
          this.data.itemTypeOptions[selectedItemTypeFilterIndex].id,
      },
      () => {
        this.applyView();
        this.refreshControlsSummary();
      },
    );
  },

  onDisplayModeChange(event) {
    const displayMode = normalizeDailyDisplayMode(
      event.currentTarget.dataset.mode,
    );
    wx.setStorageSync(DAILY_DISPLAY_MODE_KEY, displayMode);
    this.setData({
      displayMode,
    }, () => this.refreshControlsSummary());
  },

  onOpenReminderCard(event) {
    const target = getReminderCardTarget({
      id: event.currentTarget.dataset.reminderId,
      linkedRecordId:
        event.currentTarget.dataset.linkedRecordId || "",
    });

    if (target.type === "record") {
      this.openRecord(target.id);
      return;
    }

    if (!this.ensureFreshForWrite()) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=reminder&reminderId=${
        target.id
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onCheckInReminder(event) {
    if (!this.ensureFreshForWrite()) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=checkIn&reminderId=${
        event.currentTarget.dataset.reminderId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onOpenRecord(event) {
    this.openRecord(event.currentTarget.dataset.recordId);
  },

  openRecord(recordId) {
    wx.navigateTo({
      url: `/pages/record-detail/record-detail?recordId=${
        recordId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onOpenRule(event) {
    if (!this.ensureFreshForWrite()) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=recurring&ruleId=${
        event.currentTarget.dataset.ruleId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  async onRunMaterializer() {
    if (
      !this.ensureFreshForWrite() ||
      this.data.runningMaterializer ||
      !this.data.familyId
    ) {
      return;
    }

    this.setData({
      runningMaterializer: true,
    });

    try {
      const result = await app.callReminderMaterializer({
        familyId: this.data.familyId,
      });
      wx.showToast({
        title: `新增 ${result.createdReminderCount} 条`,
        icon: "none",
      });
      await this.loadDailyHealth({
        silent: true,
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "调度失败",
        icon: "none",
      });
    } finally {
      this.setData({
        runningMaterializer: false,
      });
    }
  },

  applyView() {
    if (!this._dailyData) {
      return;
    }

    const view = buildDailyHealthView({
      ...this._dailyData,
      filters: {
        memberId: this.data.memberFilterId,
        templateId: this.data.templateFilterId,
        itemType: this.data.itemTypeFilter,
      },
    });
    this.setData({
      records: view.records,
      reminders: view.reminders,
      recurringRules: view.recurringRules,
      timelineItems: view.timelineItems,
    });
  },

  ensureFreshForWrite() {
    if (!this.data.interactionsLocked) {
      return true;
    }

    wx.showToast({
      title: "云端更新完成后才能修改",
      icon: "none",
    });
    return false;
  },

  applyDailyResult(result, { fromCache = false } = {}) {
    const records = formatRecords(result.records);
    const reminders = formatReminders(result.reminders);
    const recurringRules = formatRecurringRules(
      result.recurringRules,
    );
    const memberOptions = [
      {
        id: "all",
        label: "全部成员",
      },
      ...result.members.map((member) => ({
        id: member.id,
        label: member.displayName,
      })),
    ];
    const templateOptions = createTemplateOptions(
      records,
      reminders,
      recurringRules,
    );
    const memberFilterId = memberOptions.some(
      (option) => option.id === this.data.memberFilterId,
    )
      ? this.data.memberFilterId
      : "all";
    const templateFilterId = templateOptions.some(
      (option) => option.id === this.data.templateFilterId,
    )
      ? this.data.templateFilterId
      : "all";
    this._dailyData = {
      records,
      reminders,
      recurringRules,
    };
    const view = buildDailyHealthView({
      ...this._dailyData,
      filters: {
        memberId: memberFilterId,
        templateId: templateFilterId,
        itemType: this.data.itemTypeFilter,
      },
    });
    this.setData({
      status: "ready",
      familyId: result.family.id,
      familyName: result.family.name,
      memberOptions,
      templateOptions,
      memberFilterId,
      templateFilterId,
      selectedMemberFilterIndex: memberOptions.findIndex(
        (option) => option.id === memberFilterId,
      ),
      selectedTemplateFilterIndex: templateOptions.findIndex(
        (option) => option.id === templateFilterId,
      ),
      reminders: view.reminders,
      records: view.records,
      recurringRules: view.recurringRules,
      timelineItems: view.timelineItems,
      refreshing: fromCache,
      interactionsLocked: fromCache,
      cacheNotice: fromCache
        ? "正在更新云端数据，完成前只能查看"
        : "",
    }, () => this.refreshControlsSummary());
  },

  async loadDailyHealth({ silent = false } = {}) {
    const loadId = (this._loadId || 0) + 1;
    const requestedDate = this.data.date;
    this._loadId = loadId;

    if (!silent && this.data.status !== "ready") {
      this.setData({
        status: "loading",
        interactionsLocked: true,
        errorMessage: "",
        showGoFamily: false,
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
      const result = await loader.load(requestedDate, {
        onCached: (cachedResult) => {
          if (
            loadId !== this._loadId ||
            requestedDate !== this.data.date
          ) {
            return;
          }

          showedCachedData = true;
          this.applyDailyResult(cachedResult, {
            fromCache: true,
          });
        },
      });

      if (
        loadId !== this._loadId ||
        requestedDate !== this.data.date
      ) {
        return;
      }

      this.applyDailyResult(result);
      loader.prefetch(result.family.id, [
        shiftDailyDate(requestedDate, -1),
        shiftDailyDate(requestedDate, 1),
      ]);
    } catch (error) {
      if (loadId !== this._loadId) {
        return;
      }

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
        errorMessage: error.message || "暂时无法加载每日健康",
        showGoFamily: error.code === "FAMILY_REQUIRED",
      });
    }
  },
});
