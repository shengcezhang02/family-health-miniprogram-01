const {
  createDashboardCardStore,
} = require("../../services/dashboard-card-store");

const TYPE_OPTIONS = [
  {
    value: "trend",
    label: "趋势",
    description: "数值字段随时间的变化",
  },
  {
    value: "record_list",
    label: "记录列表",
    description: "按时间查看多条健康记录",
  },
  {
    value: "latest_data",
    label: "最新数据",
    description: "最新一次数据和上次变化",
  },
  {
    value: "reminder_completion",
    label: "提醒完成",
    description: "完成次数、完成率和未打卡项",
  },
  {
    value: "recurring_rules",
    label: "周期提醒",
    description: "集中查看周期规则",
  },
];

const TYPE_LABELS = TYPE_OPTIONS.reduce((labels, option) => {
  labels[option.value] = option.label;
  return labels;
}, {});

const dashboardCardStore = createDashboardCardStore({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

Page({
  data: {
    status: "loading",
    userId: "",
    familyId: "",
    familyName: "当前家庭",
    cards: [],
    typeOptions: TYPE_OPTIONS,
    showTypePicker: false,
    errorMessage: "",
  },

  onLoad(options) {
    this.setData({
      userId: options.userId || "",
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
    });
  },

  onShow() {
    this.loadCards();
  },

  onPullDownRefresh() {
    this.loadCards();
    wx.stopPullDownRefresh();
  },

  getScope() {
    return {
      userId: this.data.userId,
      familyId: this.data.familyId,
    };
  },

  loadCards() {
    if (!this.data.userId || !this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "看板信息已失效，请返回健康记录重试",
      });
      return;
    }

    const cards = dashboardCardStore.initialize(this.getScope());
    this.setData({
      status: "ready",
      cards: cards.map((card, index) => ({
        ...card,
        typeLabel: TYPE_LABELS[card.type] || "健康卡片",
        positionLabel: `${index + 1} / ${cards.length}`,
        canMoveUp: index > 0,
        canMoveDown: index < cards.length - 1,
      })),
      errorMessage: "",
    });
  },

  onToggleTypePicker() {
    this.setData({
      showTypePicker: !this.data.showTypePicker,
    });
  },

  onAddCard(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/dashboard-card-editor/dashboard-card-editor?userId=${
        this.data.userId
      }&familyId=${this.data.familyId}&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&mode=create&type=${type}`,
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

  onCopyCard(event) {
    dashboardCardStore.copy(
      this.getScope(),
      event.currentTarget.dataset.cardId,
    );
    this.loadCards();
    wx.showToast({
      title: "已复制卡片",
      icon: "success",
    });
  },

  async onDeleteCard(event) {
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "删除这张卡片？",
        content: "只删除本机看板配置，不会删除任何健康数据。",
        confirmText: "删除",
        confirmColor: "#b34e49",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });

    if (!confirmed) {
      return;
    }

    dashboardCardStore.remove(
      this.getScope(),
      event.currentTarget.dataset.cardId,
    );
    this.loadCards();
  },

  onMoveCard(event) {
    const cardId = event.currentTarget.dataset.cardId;
    const direction = Number(event.currentTarget.dataset.direction);
    const cards = dashboardCardStore.load(this.getScope());
    const index = cards.findIndex((card) => card.id === cardId);
    const targetIndex = index + direction;

    if (
      index < 0 ||
      targetIndex < 0 ||
      targetIndex >= cards.length
    ) {
      return;
    }

    const orderedIds = cards.map((card) => card.id);
    [orderedIds[index], orderedIds[targetIndex]] = [
      orderedIds[targetIndex],
      orderedIds[index],
    ];
    dashboardCardStore.reorder(this.getScope(), orderedIds);
    this.loadCards();
  },
});
