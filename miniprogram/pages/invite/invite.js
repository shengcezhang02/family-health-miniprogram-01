const app = getApp();

Page({
  data: {
    mode: "join",
    status: "loading",
    family: null,
    createdInvite: null,
    shortCode: "",
    joinCredential: null,
    invitePreview: null,
    profileManagementAllowed: true,
    busy: false,
    errorMessage: "",
  },

  onLoad(options) {
    const mode = options.mode === "create" ? "create" : "join";
    this.setData({
      mode,
    });
    this.prepare(options);
  },

  async prepare(options) {
    try {
      const bootstrap = await app.callFamilyApi("bootstrap");

      if (this.data.mode === "create") {
        const family = bootstrap.families.find(
          (candidate) => candidate.id === options.familyId,
        );

        if (!family) {
          throw new Error("当前家庭已失效，请返回首页重试");
        }

        this.setData({
          family,
          status: "ready",
        });
        return;
      }

      this.setData({
        status: "ready",
      });

      if (options.inviteToken) {
        await this.resolveInvite({
          token: decodeURIComponent(options.inviteToken),
        });
      }
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载邀请",
      });
    }
  },

  async onCreateInvite() {
    if (this.data.busy) {
      return;
    }

    this.setData({
      busy: true,
      errorMessage: "",
    });

    try {
      const result = await app.callFamilyApi("createInvite", {
        familyId: this.data.family.id,
      });
      this.setData({
        createdInvite: {
          ...result.invite,
          expiresAtText: this.formatDateTime(result.invite.expiresAt),
        },
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "创建邀请失败",
      });
    } finally {
      this.setData({
        busy: false,
      });
    }
  },

  async onRevokeInvite() {
    if (this.data.busy || !this.data.createdInvite) {
      return;
    }

    this.setData({
      busy: true,
      errorMessage: "",
    });

    try {
      await app.callFamilyApi("revokeInvite", {
        inviteId: this.data.createdInvite.id,
      });
      this.setData({
        createdInvite: null,
      });
      wx.showToast({
        title: "邀请已撤销",
        icon: "success",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "撤销邀请失败",
      });
    } finally {
      this.setData({
        busy: false,
      });
    }
  },

  onCopyShortCode() {
    wx.setClipboardData({
      data: this.data.createdInvite.shortCode,
    });
  },

  onShortCodeInput(event) {
    this.setData({
      shortCode: event.detail.value.toUpperCase().replace(/\s/g, ""),
      errorMessage: "",
    });
  },

  async onResolveShortCode() {
    if (this.data.shortCode.length !== 6) {
      this.setData({
        errorMessage: "请输入 6 位邀请码",
      });
      return;
    }

    await this.resolveInvite({
      shortCode: this.data.shortCode,
    });
  },

  async resolveInvite(credential) {
    if (this.data.busy) {
      return;
    }

    this.setData({
      busy: true,
      errorMessage: "",
    });

    try {
      const result = await app.callFamilyApi(
        "resolveInvite",
        credential,
      );
      this.setData({
        joinCredential: credential,
        invitePreview: result.invite,
        profileManagementAllowed: true,
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "邀请码无效或已失效",
      });
    } finally {
      this.setData({
        busy: false,
      });
    }
  },

  onProfileManagementChange(event) {
    this.setData({
      profileManagementAllowed: event.detail.value,
    });
  },

  onChangeInviteCode() {
    this.setData({
      joinCredential: null,
      invitePreview: null,
      errorMessage: "",
    });
  },

  async onJoinFamily() {
    if (this.data.busy || !this.data.joinCredential) {
      return;
    }

    this.setData({
      busy: true,
      errorMessage: "",
    });

    try {
      const result = await app.callFamilyApi("joinFamily", {
        ...this.data.joinCredential,
        profileManagementAllowed:
          this.data.profileManagementAllowed,
      });
      wx.setStorageSync("currentFamilyId", result.family.id);
      wx.reLaunch({
        url: "/pages/index/index",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "加入家庭失败",
        busy: false,
      });
    }
  },

  onShareAppMessage() {
    const invite = this.data.createdInvite;

    if (!invite) {
      return {
        title: "家庭健康",
        path: "/pages/index/index",
      };
    }

    return {
      title: `${this.data.family.name} 邀请你加入家庭健康空间`,
      path: `/pages/invite/invite?mode=join&inviteToken=${encodeURIComponent(
        invite.token,
      )}`,
    };
  },

  formatDateTime(value) {
    const date = new Date(value);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate(),
    )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  },
});
