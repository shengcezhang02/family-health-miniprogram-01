const app = getApp();

function pad(value) {
  return String(value).padStart(2, "0");
}

function createRequestId() {
  return `submit-care-share-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

const STATUS_COPY = {
  expired: {
    title: "分享已过期",
    description: "请让家人重新发起一份关心分享。",
  },
  canceled: {
    title: "该提醒已取消",
    description: "这份分享暂时不能再填写。",
  },
  completed: {
    title: "已经完成",
    description: "家人已经完成这项健康记录，不需要重复填写。",
  },
  paused: {
    title: "暂时不能填写",
    description: "档案所属人当前不是这个家庭的有效成员。",
  },
  member_required: {
    title: "仅限家庭成员填写",
    description: "请使用已加入该家庭的微信账号打开。",
  },
};

Page({
  data: {
    status: "loading",
    token: "",
    share: null,
    fieldValues: {},
    fieldChoiceIndexes: {},
    selectedChoiceLabels: {},
    remark: "",
    saving: false,
    stateTitle: "",
    stateDescription: "",
    errorMessage: "",
  },

  onLoad(options) {
    this._requestId = "";
    this.setData({ token: options.token || "" });
    this.loadShare();
  },

  onRetry() {
    this.loadShare();
  },

  async loadShare() {
    if (!this.data.token) {
      this.setData({
        status: "error",
        errorMessage: "分享链接不完整",
      });
      return;
    }

    this.setData({ status: "loading", errorMessage: "" });

    try {
      await app.callFamilyApi("bootstrap");
      const result = await app.callShareApi("resolveCareShare", {
        token: this.data.token,
      });
      const share = result.share;

      if (share.status !== "ready") {
        const copy = STATUS_COPY[share.status] || {
          title: "暂时无法打开",
          description: "请稍后重试。",
        };
        this.setData({
          status: share.status,
          stateTitle: copy.title,
          stateDescription: copy.description,
          share: null,
        });
        return;
      }

      const fieldChoiceIndexes = {};
      const selectedChoiceLabels = {};

      for (const field of share.form.fields) {
        if (field.type !== "single_choice") {
          continue;
        }

        const index = Math.max(
          (field.options || []).findIndex(
            (option) => option.key === share.form.values[field.key],
          ),
          0,
        );
        fieldChoiceIndexes[field.key] = index;
        selectedChoiceLabels[field.key] =
          field.options?.[index]?.label || "请选择";
      }

      this.setData({
        status: "ready",
        share,
        fieldValues: { ...share.form.values },
        fieldChoiceIndexes,
        selectedChoiceLabels,
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法打开这份分享",
      });
    }
  },

  onFieldInput(event) {
    this.setData({
      [`fieldValues.${event.currentTarget.dataset.fieldKey}`]:
        event.detail.value,
      errorMessage: "",
    });
  },

  onChoiceChange(event) {
    const fieldKey = event.currentTarget.dataset.fieldKey;
    const optionIndex = Number(event.detail.value);
    const field = this.data.share.form.fields.find(
      (candidate) => candidate.key === fieldKey,
    );
    const option = field?.options?.[optionIndex];

    if (!option) {
      return;
    }

    this.setData({
      [`fieldValues.${fieldKey}`]: option.key,
      [`fieldChoiceIndexes.${fieldKey}`]: optionIndex,
      [`selectedChoiceLabels.${fieldKey}`]: option.label,
      errorMessage: "",
    });
  },

  onRemarkInput(event) {
    this.setData({ remark: event.detail.value, errorMessage: "" });
  },

  buildValues() {
    const values = {};

    for (const field of this.data.share.form.fields) {
      const rawValue = this.data.fieldValues[field.key];
      const normalized =
        typeof rawValue === "string" ? rawValue.trim() : rawValue;

      if (
        normalized === undefined ||
        normalized === null ||
        normalized === ""
      ) {
        if (field.required) {
          throw new Error(`请填写${field.label}`);
        }
        continue;
      }

      if (field.type === "number") {
        const number = Number(normalized);

        if (!Number.isFinite(number)) {
          throw new Error(`${field.label}必须是有效数字`);
        }
        values[field.key] = number;
      } else {
        values[field.key] = normalized;
      }
    }

    return values;
  },

  async onSubmit() {
    if (this.data.saving || this.data.status !== "ready") {
      return;
    }

    let values;

    try {
      values = this.buildValues();
    } catch (error) {
      this.setData({ errorMessage: error.message });
      return;
    }

    this._requestId ||= createRequestId();
    this.setData({ saving: true, errorMessage: "" });

    try {
      await app.callShareApi(
        "submitCareShare",
        {
          token: this.data.token,
          occurredAt: new Date().toISOString(),
          values,
          remark: this.data.remark,
        },
        this._requestId,
      );
      this.setData({
        status: "completed",
        stateTitle: "已经完成",
        stateDescription: "健康记录已保存，家人现在可以看到结果。",
        share: null,
      });
      wx.showToast({ title: "已完成", icon: "success" });
    } catch (error) {
      if (
        error.code === "CARE_SHARE_COMPLETED" ||
        error.code === "CARE_SHARE_CANCELED" ||
        error.code === "CARE_SHARE_EXPIRED"
      ) {
        await this.loadShare();
      } else {
        this._requestId = "";
        this.setData({
          errorMessage: error.message || "提交失败，请稍后重试",
        });
      }
    } finally {
      this.setData({ saving: false });
    }
  },
});
