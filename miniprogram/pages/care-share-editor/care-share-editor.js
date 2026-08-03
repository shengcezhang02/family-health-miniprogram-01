const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");

const pageLoader = createRecordPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }) =>
    app.callTemplateApi("listTemplates", { familyId }),
  getCachedFamily: (familyId) => app.getCachedFamily(familyId),
  getCachedFamilyMembers: ({ familyId }) =>
    app.getCachedCloudApi("profile-api", "listFamilyMembers", {
      familyId,
    }),
  getCachedTemplates: ({ familyId }) =>
    app.getCachedCloudApi("template-api", "listTemplates", {
      familyId,
    }),
});

const CARD_STYLES = [
  {
    code: "warm-green",
    name: "安心绿",
    description: "平静、日常",
  },
  {
    code: "sunset",
    name: "暖橙",
    description: "温暖、醒目",
  },
  {
    code: "clear-blue",
    name: "清透蓝",
    description: "清爽、简洁",
  },
];

function createRequestId() {
  return `care-share-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "当前家庭",
    reminderId: "",
    members: [],
    templates: [],
    selectedMemberIndex: 0,
    selectedTemplateIndex: 0,
    selectedMember: null,
    selectedTemplate: null,
    reminder: null,
    remark: "",
    cardStyles: CARD_STYLES,
    cardStyleCode: "warm-green",
    creating: false,
    share: null,
    errorMessage: "",
  },

  onLoad(options) {
    this._requestId = "";
    this.setData({
      familyId: options.familyId || "",
      reminderId: options.reminderId || "",
    });
    const snapshot = pageLoader.getEditorStartupSnapshot(
      options.familyId || "",
    );

    if (snapshot && !options.reminderId) {
      this.applyEditorData(snapshot);
    }
    this.loadEditor({ silent: Boolean(snapshot && !options.reminderId) });
  },

  onRetry() {
    this.loadEditor();
  },

  async loadEditor({ silent = false } = {}) {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "请先选择家庭",
      });
      return;
    }

    if (!silent) {
      this.setData({ status: "loading", errorMessage: "" });
    }

    try {
      const result = await pageLoader.loadEditor(this.data.familyId, {
        loadExistingItem: this.data.reminderId
          ? () =>
              app.callHealthItemApi("getHealthItem", {
                reminderId: this.data.reminderId,
              })
          : undefined,
      });
      this.applyEditorData(result);
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法准备分享内容",
      });
    }
  },

  applyEditorData(result) {
    const reminder = result.existingItemResult?.reminder || null;
    const members = result.members || [];
    const templates = result.templates || [];
    const memberIndex = reminder
      ? Math.max(
          members.findIndex(
            (member) => member.id === reminder.subjectUserId,
          ),
          0,
        )
      : Math.max(
          members.findIndex((member) => member.isSelf),
          0,
        );
    const templateIndex = reminder
      ? Math.max(
          templates.findIndex(
            (template) =>
              template.id === reminder.sourceTemplateId &&
              (template.sourceType || "system") ===
                reminder.sourceTemplateType,
          ),
          0,
        )
      : 0;

    this.setData({
      status: "ready",
      familyName: result.family?.name || "当前家庭",
      members,
      templates,
      selectedMemberIndex: memberIndex,
      selectedTemplateIndex: templateIndex,
      selectedMember: members[memberIndex] || null,
      selectedTemplate: templates[templateIndex] || null,
      reminder,
      remark: reminder?.remark || this.data.remark,
      errorMessage: "",
    });
  },

  onMemberChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      selectedMemberIndex: index,
      selectedMember: this.data.members[index] || null,
      share: null,
      errorMessage: "",
    });
  },

  onTemplateChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      selectedTemplateIndex: index,
      selectedTemplate: this.data.templates[index] || null,
      share: null,
      errorMessage: "",
    });
  },

  onRemarkInput(event) {
    this.setData({
      remark: event.detail.value,
      share: null,
      errorMessage: "",
    });
  },

  onChooseStyle(event) {
    this.setData({
      cardStyleCode: event.currentTarget.dataset.styleCode,
      share: null,
      errorMessage: "",
    });
  },

  async onCreateShare() {
    if (this.data.creating) {
      return;
    }

    if (
      !this.data.reminderId &&
      (!this.data.selectedMember || !this.data.selectedTemplate)
    ) {
      this.setData({ errorMessage: "请选择档案所属人和健康项目" });
      return;
    }

    this._requestId ||= createRequestId();
    const source = this.data.reminderId
      ? {
          type: "reminder",
          reminderId: this.data.reminderId,
        }
      : {
          type: "immediate",
          familyId: this.data.familyId,
          subjectUserId: this.data.selectedMember.id,
          sourceTemplateType:
            this.data.selectedTemplate.sourceType || "system",
          sourceTemplateId: this.data.selectedTemplate.id,
          remark: this.data.remark,
        };

    this.setData({ creating: true, errorMessage: "" });

    try {
      const result = await app.callShareApi(
        "createCareShare",
        {
          source,
          cardStyleCode: this.data.cardStyleCode,
        },
        this._requestId,
      );
      this.setData({ share: result.share });
      wx.showToast({ title: "分享卡已生成", icon: "success" });
    } catch (error) {
      this._requestId = "";
      this.setData({
        errorMessage: error.message || "生成分享卡失败，请稍后重试",
      });
    } finally {
      this.setData({ creating: false });
    }
  },

  onPreviewShare() {
    const share = this.data.share;

    if (!share?.path) {
      return;
    }

    wx.navigateTo({ url: share.path });
  },

  onShareAppMessage() {
    const share = this.data.share;

    if (!share) {
      return {
        title: "请帮家人完成一项健康记录",
        path: "/pages/index/index",
      };
    }

    return {
      title: `${share.displaySnapshot.subjectDisplayName}有一项${share.displaySnapshot.templateName}待填写`,
      path: share.path,
    };
  },
});
