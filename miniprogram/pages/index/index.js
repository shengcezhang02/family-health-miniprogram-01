Page({
  data: {
    status: "loading",
    message: "正在连接家庭健康服务",
  },

  onLoad() {
    this.bootstrap();
  },

  onRetry() {
    this.bootstrap();
  },

  async bootstrap() {
    this.setData({
      status: "loading",
      message: "正在连接家庭健康服务",
    });

    if (!wx.cloud) {
      this.setData({
        status: "error",
        message: "当前微信版本暂不支持云服务，请升级微信后重试",
      });
      return;
    }

    try {
      const response = await wx.cloud.callFunction({
        name: "family-api",
        data: {
          action: "bootstrap",
          requestId: this.createRequestId(),
        },
      });

      if (!response.result?.ok) {
        throw new Error(response.result?.error?.message || "服务连接失败");
      }

      this.setData({
        status: "ready",
        message: "云端连接正常，可以开始建立家庭健康空间",
      });
    } catch (error) {
      console.error("bootstrap failed", error);
      this.setData({
        status: "error",
        message: "暂时无法连接服务，请检查网络后重试",
      });
    }
  },

  createRequestId() {
    return `bootstrap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  },
});
