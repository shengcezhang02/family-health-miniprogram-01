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

  async callFamilyApi(action, data) {
    const response = await wx.cloud.callFunction({
      name: "family-api",
      data: {
        action,
        requestId: `${action}-${Date.now()}-${Math.random()
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
});
