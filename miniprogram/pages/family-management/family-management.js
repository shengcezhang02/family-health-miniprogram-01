const app = getApp();
const {
  createCurrentFamilyPreference,
} = require("../../services/current-family-preference");
const {
  buildFamilyManagementView,
} = require("../../services/family-management-view");

const currentFamilyPreference = createCurrentFamilyPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    family: null,
    members: [],
    successorOptions: [],
    successorIndex: 0,
    canInvite: false,
    canDissolve: false,
    canDemoteSelf: false,
    mustTransferBeforeLeaving: false,
    canLeaveDirectly: false,
    processing: false,
    confirmationName: "",
    notice: "",
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
    this.loadFamily();
  },

  onRetry() {
    this.loadFamily({ fresh: true });
  },

  async onPullDownRefresh() {
    try {
      await this.loadFamily({
        fresh: true,
        preserveContent: true,
      });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadFamily({
    fresh = false,
    preserveContent = false,
  } = {}) {
    if (this._loading || !this.data.familyId) {
      if (!this.data.familyId) {
        this.setData({
          status: "error",
          errorMessage: "家庭信息已失效，请返回“我和家庭”重试",
        });
      }
      return;
    }

    this._loading = true;
    this.setData({
      ...(preserveContent ? {} : { status: "loading" }),
      notice: "",
      errorMessage: "",
    });

    try {
      const bootstrap = await app.callFamilyApi(
        "bootstrap",
        undefined,
        { fresh },
      );
      const family = bootstrap.families.find(
        (candidate) => candidate.id === this.data.familyId,
      );

      if (!family) {
        const error = new Error("你已不是这个家庭的有效成员");
        error.code = "FAMILY_ACCESS_DENIED";
        throw error;
      }

      const memberResult = await app.callProfileApi(
        "listFamilyMembers",
        {
          familyId: family.id,
        },
        { fresh },
      );
      const view = buildFamilyManagementView({
        family,
        currentUserId: bootstrap.user.id,
        members: memberResult.members,
      });

      this.setData({
        status: "ready",
        family,
        familyName: family.name,
        members: view.members,
        successorOptions: view.successorOptions,
        successorIndex: 0,
        canInvite: view.canInvite,
        canDissolve: view.canDissolve,
        canDemoteSelf: view.canDemoteSelf,
        mustTransferBeforeLeaving:
          view.mustTransferBeforeLeaving,
        canLeaveDirectly: view.canLeaveDirectly,
      });
    } catch (error) {
      this.setData({
        ...(preserveContent ? {} : { status: "error" }),
        errorMessage:
          error.message || "暂时无法加载家庭管理信息",
      });
    } finally {
      this._loading = false;
    }
  },

  onOpenMember(event) {
    const userId = event.currentTarget.dataset.userId;

    wx.navigateTo({
      url: `/pages/family-member/family-member?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&userId=${userId}`,
    });
  },

  onInviteFamily() {
    wx.navigateTo({
      url: `/pages/invite/invite?mode=create&familyId=${this.data.familyId}`,
    });
  },

  onSuccessorChange(event) {
    this.setData({
      successorIndex: Number(event.detail.value),
      notice: "",
      errorMessage: "",
    });
  },

  onConfirmationNameInput(event) {
    this.setData({
      confirmationName: event.detail.value,
      errorMessage: "",
    });
  },

  async onDemoteSelf() {
    if (!this.data.canDemoteSelf || this.data.processing) {
      return;
    }

    const confirmed = await this.confirm({
      title: "降级为普通成员？",
      content:
        "降级后将失去邀请、移除成员和解散家庭等管理员权限。",
      confirmText: "确认降级",
    });

    if (!confirmed) {
      return;
    }

    await this.runAction(
      "demoteSelfFromAdmin",
      {
        familyId: this.data.familyId,
      },
      "已降级为普通成员",
    );
  },

  async onLeaveFamily() {
    if (!this.data.canLeaveDirectly || this.data.processing) {
      return;
    }

    const confirmed = await this.confirm({
      title: "退出这个家庭？",
      content:
        "退出后将立即失去该家庭的访问权限；过去记录仍作为家庭历史保留。",
      confirmText: "确认退出",
    });

    if (!confirmed) {
      return;
    }

    await this.runLeavingAction("leaveFamily", {
      familyId: this.data.familyId,
    });
  },

  async onTransferAndLeave() {
    if (
      !this.data.mustTransferBeforeLeaving ||
      this.data.processing
    ) {
      return;
    }

    const successor =
      this.data.successorOptions[this.data.successorIndex];

    if (!successor) {
      this.setData({
        errorMessage:
          "没有其他有效成员可以接任；请保留家庭或解散家庭",
      });
      return;
    }

    const confirmed = await this.confirm({
      title: "转让管理员并退出？",
      content: `${successor.displayName} 将成为管理员，你会立即退出当前家庭。`,
      confirmText: "转让并退出",
    });

    if (!confirmed) {
      return;
    }

    await this.runLeavingAction("transferAdminAndLeave", {
      familyId: this.data.familyId,
      successorUserId: successor.id,
    });
  },

  async onDissolveFamily() {
    if (!this.data.canDissolve || this.data.processing) {
      return;
    }

    if (
      this.data.confirmationName.trim() !==
      this.data.familyName
    ) {
      this.setData({
        errorMessage: `请输入完整家庭名称“${this.data.familyName}”`,
      });
      return;
    }

    const confirmed = await this.confirm({
      title: "永久解散家庭？",
      content:
        "该操作会永久删除这个家庭及其健康数据，不能从回收站恢复。",
      confirmText: "永久解散",
    });

    if (!confirmed) {
      return;
    }

    await this.runLeavingAction("dissolveFamily", {
      familyId: this.data.familyId,
      confirmationName: this.data.confirmationName.trim(),
    });
  },

  async runAction(action, data, successMessage) {
    this.setData({
      processing: true,
      notice: "",
      errorMessage: "",
    });

    try {
      await app.callFamilyApi(action, data);
      await this.loadFamily();
      this.setData({
        notice: successMessage,
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "操作失败，请稍后重试",
      });
    } finally {
      this.setData({
        processing: false,
      });
    }
  },

  async runLeavingAction(action, data) {
    this.setData({
      processing: true,
      notice: "",
      errorMessage: "",
    });

    try {
      await app.callFamilyApi(action, data);
      currentFamilyPreference.resolve([]);
      wx.reLaunch({
        url: "/pages/index/index",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "操作失败，请稍后重试",
      });
    } finally {
      this.setData({
        processing: false,
      });
    }
  },

  confirm({ title, content, confirmText }) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText,
        confirmColor: "#b34e49",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
  },
});
