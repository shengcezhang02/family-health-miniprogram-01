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

Page({
  data: {
    status: "loading",
    message: "正在连接家庭健康服务",
    currentFamily: null,
    showFamilyForm: false,
    familyName: "",
    formError: "",
    creating: false,
    families: [],
    showFamilySwitcher: false,
  },

  onLoad() {
    this.bootstrap();
  },

  onShow() {
    syncMainNavigationSelection(this);

    if (this.data.status === "ready") {
      this.refreshFamilyContext();
    }
  },

  onRetry() {
    this.bootstrap({ fresh: true });
  },

  async onPullDownRefresh() {
    try {
      if (this.data.status === "ready") {
        await this.refreshFamilyContext({ fresh: true });
      } else {
        await this.bootstrap({ fresh: true });
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  onShowFamilyForm() {
    this.setData({
      showFamilyForm: true,
      formError: "",
    });
  },

  onHideFamilyForm() {
    if (this.data.creating) {
      return;
    }

    this.setData({
      showFamilyForm: false,
      familyName: "",
      formError: "",
    });
  },

  onFamilyNameInput(event) {
    this.setData({
      familyName: event.detail.value,
      formError: "",
    });
  },

  async onCreateFamily() {
    const name = this.data.familyName.trim();

    if (!name) {
      this.setData({
        formError: "请先给家庭起一个名字",
      });
      return;
    }

    await this.createSpace("createFamily", { name });
  },

  async onCreatePersonalSpace() {
    await this.createSpace("createPersonalSpace");
  },

  async bootstrap({ fresh = false } = {}) {
    this.setData({
      status: "loading",
      message: "正在连接家庭健康服务",
      formError: "",
    });

    if (!wx.cloud) {
      this.setData({
        status: "error",
        message: "当前微信版本暂不支持云服务，请升级微信后重试",
      });
      return;
    }

    try {
      const data = await this.callFamilyApi(
        "bootstrap",
        undefined,
        { fresh },
      );
      const currentFamily = currentFamilyPreference.resolve(data.families);

      this.setData({
        status: "ready",
        message: currentFamily
          ? "已进入上次使用的家庭空间"
          : "环境已就绪，可以创建第一个家庭空间",
        currentFamily,
        families: data.families,
      });
    } catch (error) {
      console.error("bootstrap failed", error);
      this.setData({
        status: "error",
        message: error.message || "暂时无法连接服务，请检查网络后重试",
      });
    }
  },

  async refreshFamilyContext({ fresh = false } = {}) {
    try {
      const data = await this.callFamilyApi(
        "bootstrap",
        undefined,
        { fresh },
      );
      const currentFamily = currentFamilyPreference.resolve(
        data.families,
      );

      this.setData({
        currentFamily,
        families: data.families,
      });
    } catch (error) {
      console.warn("refresh family context failed", error);
    }
  },

  onInviteFamily() {
    wx.navigateTo({
      url: `/pages/invite/invite?mode=create&familyId=${this.data.currentFamily.id}`,
    });
  },

  onJoinFamily() {
    wx.navigateTo({
      url: "/pages/invite/invite?mode=join",
    });
  },

  onOpenProfiles() {
    const family = this.data.currentFamily;

    if (!family) {
      return;
    }

    wx.navigateTo({
      url: `/pages/profile/profile?familyId=${family.id}&familyName=${encodeURIComponent(
        family.name,
      )}`,
    });
  },

  onManageFamily() {
    const family = this.data.currentFamily;

    if (!family) {
      return;
    }

    wx.navigateTo({
      url: `/pages/family-management/family-management?familyId=${
        family.id
      }&familyName=${encodeURIComponent(family.name)}`,
    });
  },

  onOpenRecords() {
    const family = this.data.currentFamily;

    if (!family) {
      return;
    }

    wx.switchTab({
      url: "/pages/records/records",
    });
  },

  onQuickAddRecord() {
    const family = this.data.currentFamily;

    if (!family) {
      return;
    }

    wx.navigateTo({
      url: `/pages/record-editor/record-editor?familyId=${family.id}&familyName=${encodeURIComponent(
        family.name,
      )}`,
    });
  },

  onToggleFamilySwitcher() {
    this.setData({
      showFamilySwitcher: !this.data.showFamilySwitcher,
    });
  },

  onSelectFamily(event) {
    const selected = this.data.families.find(
      (family) => family.id === event.currentTarget.dataset.familyId,
    );

    if (!selected) {
      return;
    }

    this.setData({
      currentFamily: currentFamilyPreference.select(selected),
      showFamilySwitcher: false,
      message: "已切换家庭空间",
    });
  },

  async createSpace(action, data) {
    if (this.data.creating) {
      return;
    }

    this.setData({
      creating: true,
      formError: "",
    });

    try {
      const result = await this.callFamilyApi(action, data);
      const currentFamily = currentFamilyPreference.select(result.family);

      this.setData({
        currentFamily,
        families: [currentFamily],
        showFamilyForm: false,
        familyName: "",
        message: "家庭空间已建立",
      });
    } catch (error) {
      this.setData({
        formError: error.message || "创建失败，请稍后重试",
      });
    } finally {
      this.setData({
        creating: false,
      });
    }
  },

  async callFamilyApi(action, data, options) {
    return getApp().callFamilyApi(action, data, options);
  },
});
