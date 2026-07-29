const app = getApp();

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    items: [],
    restoringId: "",
    errorMessage: "",
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
    this.loadItems();
  },

  onRetry() {
    this.loadItems();
  },

  async loadItems() {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
    });

    try {
      const result = await app.callQueryApi(
        "getDeletedRecordTimeline",
        {
          familyId: this.data.familyId,
        },
      );
      this.setData({
        status: "ready",
        items: result.items.map((item) => ({
          ...item,
          displayOccurredAt: formatDateTime(item.occurredAt),
          displayDeletedAt: formatDateTime(item.deletedAt),
        })),
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法读取已删除记录",
      });
    }
  },

  async onRestore(event) {
    const recordId = event.currentTarget.dataset.recordId;
    const item = this.data.items.find(
      (candidate) => candidate.id === recordId,
    );

    if (!item || this.data.restoringId) {
      return;
    }

    this.setData({
      restoringId: recordId,
      errorMessage: "",
    });

    try {
      await app.callHealthItemApi("restoreItem", {
        recordId,
        expectedRevision: item.revision,
      });
      this.setData({
        items: this.data.items.filter(
          (candidate) => candidate.id !== recordId,
        ),
      });
      wx.showToast({
        title: "记录已恢复",
        icon: "success",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "恢复失败，请稍后重试",
      });
    } finally {
      this.setData({
        restoringId: "",
      });
    }
  },
});
