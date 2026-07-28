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
});
