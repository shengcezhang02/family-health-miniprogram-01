const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");

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
  },

  onLoad() {
    this.bootstrap();
  },

  onRetry() {
    this.bootstrap();
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

  async bootstrap() {
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
      const data = await this.callFamilyApi("bootstrap");
      const currentFamily = currentFamilyPreference.resolve(data.families);

      this.setData({
        status: "ready",
        message: currentFamily
          ? "已进入上次使用的家庭空间"
          : "环境已就绪，可以创建第一个家庭空间",
        currentFamily,
      });
    } catch (error) {
      console.error("bootstrap failed", error);
      this.setData({
        status: "error",
        message: error.message || "暂时无法连接服务，请检查网络后重试",
      });
    }
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

  async callFamilyApi(action, data) {
    const response = await wx.cloud.callFunction({
      name: "family-api",
      data: {
        action,
        requestId: this.createRequestId(action),
        data,
      },
    });
    const result = response.result;

    if (!result?.ok) {
      throw new Error(result?.error?.message || "服务连接失败");
    }

    return result.data;
  },

  createRequestId(action) {
    return `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  },
});
