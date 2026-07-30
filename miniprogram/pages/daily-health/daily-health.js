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
    displaySubjectName: reminder.subject.displayName,
    displayFields: formatFields(reminder),
    canCheckIn: reminder.status === "pending",
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
    errorMessage: "",
    showGoFamily: false,
  },

  onLoad() {
    const todayDate = toLocalDateString(new Date());
    this.setData({
      date: todayDate,
      todayDate,
      ...getDateDisplayData(todayDate, todayDate),
    });
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

  selectDate(date) {
    if (!date || date === this.data.date) {
      return;
    }

    this.setData({
      date,
      ...getDateDisplayData(date, this.data.todayDate),
    });
    this.loadDailyHealth();
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
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=reminder&familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onAddRecord() {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(this.data.familyName)}`,
    });
  },

  onEditReminder(event) {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=reminder&reminderId=${
        event.currentTarget.dataset.reminderId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
    });
  },

  onCheckInReminder(event) {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=checkIn&reminderId=${
        event.currentTarget.dataset.reminderId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}`,
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

  async loadDailyHealth({ silent = false } = {}) {
    if (!silent) {
      this.setData({
        status: "loading",
        errorMessage: "",
        showGoFamily: false,
      });
    }

    try {
      const result = await loader.load(this.data.date);
      this.setData({
        status: "ready",
        familyId: result.family.id,
        familyName: result.family.name,
        reminders: formatReminders(result.reminders),
        records: formatRecords(result.records),
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
        errorMessage: error.message || "暂时无法加载每日健康",
        showGoFamily: error.code === "FAMILY_REQUIRED",
      });
    }
  },
});
