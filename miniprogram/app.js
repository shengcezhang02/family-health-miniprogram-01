const { cloudEnvId } = require("./config/environment");

App({
  globalData: {
    cloudEnvId,
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error("当前微信基础库不支持云开发");
      return;
    }

    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true,
    });
  },

  async callCloudApi(name, action, data, requestId) {
    const response = await wx.cloud.callFunction({
      name,
      data: {
        action,
        requestId:
          requestId ||
          `${action}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`,
        data,
      },
    });
    const result = response.result;

    if (!result?.ok) {
      const error = new Error(
        result?.error?.message || "服务连接失败",
      );
      error.code = result?.error?.code;
      throw error;
    }

    return result.data;
  },

  async callFamilyApi(action, data) {
    return this.callCloudApi("family-api", action, data);
  },

  async callProfileApi(action, data) {
    return this.callCloudApi("profile-api", action, data);
  },

  async callTemplateApi(action, data) {
    return this.callCloudApi("template-api", action, data);
  },

  async callHealthItemApi(action, data, requestId) {
    return this.callCloudApi(
      "health-item-api",
      action,
      data,
      requestId,
    );
  },

  async callQueryApi(action, data) {
    return this.callCloudApi("query-api", action, data);
  },
});
