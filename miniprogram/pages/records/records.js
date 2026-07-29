const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");

const recordPageLoader = createRecordPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }) =>
    app.callTemplateApi("listTemplates", { familyId }),
  getRecordTimeline: ({ familyId }) =>
    app.callQueryApi("getRecordTimeline", { familyId }),
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
      .map((field) => ({
        key: field.key,
        label: field.label,
        value: `${item.values[field.key]}${field.unit || ""}`,
      })),
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
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
    });
  },

  onShow() {
    if (this.data.familyId) {
      this.loadTimeline();
    }
  },

  onRetry() {
    this.loadTimeline();
  },

  onGoHome() {
    wx.reLaunch({
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

  async loadTimeline() {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
        showGoHome: true,
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
      showGoHome: false,
    });

    try {
      const result = await recordPageLoader.loadTimeline(
        this.data.familyId,
      );
      this.setData({
        status: "ready",
        familyName: result.family.name,
        items: formatTimelineItems(result.items, result.members),
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载健康记录",
        showGoHome: error.code === "FAMILY_ACCESS_DENIED",
      });
    }
  },
});
