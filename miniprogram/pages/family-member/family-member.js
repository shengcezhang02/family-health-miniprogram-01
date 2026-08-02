const app = getApp();
const {
  buildFamilyManagementView,
} = require("../../services/family-management-view");

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    userId: "",
    member: null,
    processing: false,
    notice: "",
    errorMessage: "",
  },

  onLoad(options) {
    this.setData({
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
      userId: options.userId || "",
    });
  },

  onShow() {
    this.loadMember();
  },

  onRetry() {
    this.loadMember({ fresh: true });
  },

  async onPullDownRefresh() {
    try {
      await this.loadMember({
        fresh: true,
        preserveContent: true,
      });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadMember({
    fresh = false,
    preserveContent = false,
  } = {}) {
    if (this._loading) {
      return;
    }

    this._loading = true;
    this.setData({
      ...(preserveContent ? {} : { status: "loading" }),
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
        throw new Error("你已不是这个家庭的有效成员");
      }

      const result = await app.callProfileApi(
        "listFamilyMembers",
        {
          familyId: family.id,
        },
        { fresh },
      );
      const view = buildFamilyManagementView({
        family,
        currentUserId: bootstrap.user.id,
        members: result.members,
      });
      const member = view.members.find(
        (candidate) => candidate.id === this.data.userId,
      );

      if (!member) {
        throw new Error("该成员已不在当前家庭");
      }

      this.setData({
        status: "ready",
        member,
      });
    } catch (error) {
      this.setData({
        ...(preserveContent ? {} : { status: "error" }),
        errorMessage:
          error.message || "暂时无法加载成员信息",
      });
    } finally {
      this._loading = false;
    }
  },

  onOpenProfile() {
    wx.navigateTo({
      url: `/pages/profile/profile?familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&userId=${this.data.userId}`,
    });
  },

  async onPromoteMember() {
    if (!this.data.member?.canPromote || this.data.processing) {
      return;
    }

    const confirmed = await this.confirm(
      "提升为管理员？",
      `${this.data.member.displayName} 将可以邀请和移除普通成员，并可解散家庭。`,
      "确认提升",
    );

    if (confirmed) {
      await this.runAction("promoteMemberToAdmin", {
        familyId: this.data.familyId,
        targetUserId: this.data.member.id,
      });
    }
  },

  async onRemoveMember() {
    if (!this.data.member?.canRemove || this.data.processing) {
      return;
    }

    const confirmed = await this.confirm(
      "移除这名成员？",
      "对方会立即失去家庭访问权限；过去数据保留，其本人周期规则会暂停。",
      "确认移除",
    );

    if (!confirmed) {
      return;
    }

    this.setData({
      processing: true,
      errorMessage: "",
    });

    try {
      await app.callFamilyApi("removeMember", {
        familyId: this.data.familyId,
        targetUserId: this.data.member.id,
      });
      wx.showToast({
        title: "成员已移除",
        icon: "success",
      });
      wx.navigateBack();
    } catch (error) {
      this.setData({
        errorMessage: error.message || "移除失败，请稍后重试",
      });
    } finally {
      this.setData({
        processing: false,
      });
    }
  },

  async runAction(action, data) {
    this.setData({
      processing: true,
      notice: "",
      errorMessage: "",
    });

    try {
      await app.callFamilyApi(action, data);
      await this.loadMember();
      this.setData({
        notice: "成员角色已更新",
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

  confirm(title, content, confirmText) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText,
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
  },
});
