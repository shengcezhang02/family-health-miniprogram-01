const app = getApp();
const {
  createDisplayPreference,
} = require("../../services/display-preference");
const {
  createExternalAccessView,
} = require("../../services/external-access-view");

const displayPreference = createDisplayPreference({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
});
const externalAccessView = createExternalAccessView();

Page({
  data: {
    status: "loading",
    displaySizeClass: "display-size--large",
    activeTokens: [],
    revokedTokens: [],
    showRevoked: false,
    showCreateForm: false,
    tokenName: "",
    riskAcknowledged: false,
    creating: false,
    createdToken: null,
    selectedToken: null,
    accesses: [],
    historyLoading: false,
    processing: false,
    errorMessage: "",
  },

  onLoad() {
    this.setData({
      displaySizeClass: displayPreference.read().className,
    });
    this.loadTokens();
  },

  async onPullDownRefresh() {
    try {
      await this.loadTokens({ preserveContent: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async loadTokens({ preserveContent = false } = {}) {
    if (this._loading) {
      return;
    }

    this._loading = true;
    this.setData({
      ...(preserveContent ? {} : { status: "loading" }),
      errorMessage: "",
    });

    try {
      const result = await app.callExternalAccessApi("listTokens");
      const grouped = externalAccessView.groupTokens(result.tokens);
      const selectedToken = this.data.selectedToken
        ? [...grouped.active, ...grouped.revoked].find(
            (token) => token.id === this.data.selectedToken.id,
          ) || null
        : null;
      this.setData({
        status: "ready",
        activeTokens: grouped.active,
        revokedTokens: grouped.revoked,
        selectedToken,
      });
    } catch (error) {
      this.setData({
        status: preserveContent ? this.data.status : "error",
        errorMessage: error.message || "暂时无法加载永久令牌",
      });
    } finally {
      this._loading = false;
    }
  },

  onRetry() {
    this.loadTokens();
  },

  onShowCreateForm() {
    this.setData({
      showCreateForm: true,
      selectedToken: null,
      errorMessage: "",
    });
  },

  onHideCreateForm() {
    if (this.data.creating) {
      return;
    }

    this._createRequestId = "";
    this.setData({
      showCreateForm: false,
      tokenName: "",
      riskAcknowledged: false,
      errorMessage: "",
    });
  },

  onTokenNameInput(event) {
    this._createRequestId = "";
    this.setData({
      tokenName: event.detail.value,
      errorMessage: "",
    });
  },

  onRiskAcknowledgementChange(event) {
    this.setData({
      riskAcknowledged: event.detail.value.includes("acknowledged"),
      errorMessage: "",
    });
  },

  async onCreateToken() {
    const name = this.data.tokenName.trim();

    if (!name) {
      this.setData({ errorMessage: "请先填写令牌名称" });
      return;
    }

    if (!this.data.riskAcknowledged) {
      this.setData({
        errorMessage: "请先确认你已了解永久令牌的权限和风险",
      });
      return;
    }

    if (this.data.creating) {
      return;
    }

    this._createRequestId =
      this._createRequestId ||
      `create-token-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    this.setData({ creating: true, errorMessage: "" });

    try {
      const result = await app.callExternalAccessApi(
        "createToken",
        { name, riskAcknowledged: true },
        this._createRequestId,
      );
      this._createRequestId = "";
      this.setData({
        createdToken: result.token,
        showCreateForm: false,
        tokenName: "",
        riskAcknowledged: false,
      });
      await this.loadTokens({ preserveContent: true });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "创建失败，请稍后重试",
      });
    } finally {
      this.setData({ creating: false });
    }
  },

  onToggleRevoked() {
    this.setData({ showRevoked: !this.data.showRevoked });
  },

  onOpenToken(event) {
    const tokenId = event.currentTarget.dataset.tokenId;
    const token = [...this.data.activeTokens, ...this.data.revokedTokens].find(
      (candidate) => candidate.id === tokenId,
    );

    if (!token) {
      return;
    }

    this.setData({
      selectedToken: token,
      accesses: [],
      showCreateForm: false,
      errorMessage: "",
    });
    this.loadRecentAccesses(token.id);
  },

  onCloseTokenDetail() {
    if (!this.data.processing) {
      this.setData({ selectedToken: null, accesses: [] });
    }
  },

  async loadRecentAccesses(tokenId) {
    this.setData({ historyLoading: true });

    try {
      const result = await app.callExternalAccessApi(
        "getRecentAccesses",
        { tokenId },
      );
      if (this.data.selectedToken?.id === tokenId) {
        this.setData({
          accesses: result.accesses.map((access) =>
            externalAccessView.toAccessItem(access),
          ),
        });
      }
    } catch (error) {
      this.setData({
        errorMessage: error.message || "暂时无法加载访问历史",
      });
    } finally {
      this.setData({ historyLoading: false });
    }
  },

  async onCopyCreatedToken() {
    if (!this.data.createdToken) {
      return;
    }

    await this.copySensitiveContent({
      title: "复制永久令牌？",
      content: this.data.createdToken.credential,
    });
  },

  async onCopyToken() {
    const token = this.data.selectedToken;

    if (!token || token.status !== "active") {
      return;
    }

    await this.copyFromCloud("copyToken", "credential", token.id);
  },

  async onCopyCreatedSkill() {
    if (this.data.createdToken) {
      await this.copyFromCloud(
        "renderTokenSkill",
        "skill",
        this.data.createdToken.id,
      );
    }
  },

  async onCopySkill() {
    const token = this.data.selectedToken;

    if (token?.status === "active") {
      await this.copyFromCloud("renderTokenSkill", "skill", token.id);
    }
  },

  async copyFromCloud(action, field, tokenId) {
    if (this.data.processing) {
      return;
    }

    const confirmed = await this.confirmSensitiveCopy();

    if (!confirmed) {
      return;
    }

    this.setData({ processing: true, errorMessage: "" });

    try {
      const result = await app.callExternalAccessApi(action, { tokenId });
      await this.writeClipboard(result[field]);
    } catch (error) {
      this.setData({
        errorMessage: error.message || "复制失败，请稍后重试",
      });
    } finally {
      this.setData({ processing: false });
    }
  },

  async copySensitiveContent({ content }) {
    const confirmed = await this.confirmSensitiveCopy();

    if (confirmed) {
      await this.writeClipboard(content);
    }
  },

  confirmSensitiveCopy() {
    return this.confirm({
      title: "内容包含永久凭证",
      content:
        "复制内容可以长期修改家庭健康数据。请勿发送到公开聊天、群聊或代码仓库。",
      confirmText: "确认复制",
    });
  },

  writeClipboard(data) {
    return new Promise((resolve, reject) => {
      wx.setClipboardData({ data, success: resolve, fail: reject });
    });
  },

  onFinishCreatedToken() {
    this.setData({ createdToken: null });
  },

  async onRevokeToken() {
    const token = this.data.selectedToken;

    if (!token || token.status !== "active" || this.data.processing) {
      return;
    }

    const confirmed = await this.confirm({
      title: "永久撤销这个令牌？",
      content:
        "撤销后，这个令牌和此前复制的 Skill 都不能再访问。撤销不能恢复。",
      confirmText: "永久撤销",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    this.setData({ processing: true, errorMessage: "" });

    try {
      await app.callExternalAccessApi("revokeToken", {
        tokenId: token.id,
        expectedRevision: token.revision,
      });
      wx.showToast({ title: "令牌已撤销", icon: "success" });
      await this.loadTokens({ preserveContent: true });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "撤销失败，请稍后重试",
      });
    } finally {
      this.setData({ processing: false });
    }
  },

  confirm({ title, content, confirmText, destructive = false }) {
    return new Promise((resolve) => {
      wx.showModal({
        title,
        content,
        confirmText,
        confirmColor: destructive ? "#b34e49" : "#2e6f68",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
  },
});
