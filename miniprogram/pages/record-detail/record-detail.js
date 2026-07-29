const app = getApp();

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateTimeParts(value) {
  const date = new Date(value);

  return {
    occurredDate: `${date.getFullYear()}-${pad(
      date.getMonth() + 1,
    )}-${pad(date.getDate())}`,
    occurredTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

Page({
  data: {
    status: "loading",
    recordId: "",
    familyId: "",
    familyName: "",
    record: null,
    fieldValues: {},
    fieldChoiceIndexes: {},
    selectedChoiceLabels: {},
    remark: "",
    occurredDate: "",
    occurredTime: "",
    saving: false,
    deleting: false,
    errorMessage: "",
  },

  onLoad(options) {
    this.setData({
      recordId: options.recordId || "",
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
    });
    this.loadRecord();
  },

  onRetry() {
    this.loadRecord();
  },

  async loadRecord() {
    if (!this.data.recordId) {
      this.setData({
        status: "error",
        errorMessage: "记录编号已失效，请返回时间线重试",
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
    });

    try {
      const result = await app.callHealthItemApi("getHealthItem", {
        recordId: this.data.recordId,
      });
      const record = result.record;
      const fieldChoiceIndexes = {};
      const selectedChoiceLabels = {};

      for (const field of record.fieldSchemaSnapshot) {
        if (field.type !== "single_choice") {
          continue;
        }

        const index = Math.max(
          (field.options || []).findIndex(
            (option) => option.key === record.values[field.key],
          ),
          0,
        );
        fieldChoiceIndexes[field.key] = index;
        selectedChoiceLabels[field.key] =
          field.options?.[index]?.label || "请选择";
      }

      this.setData({
        status: "ready",
        record,
        fieldValues: { ...record.values },
        fieldChoiceIndexes,
        selectedChoiceLabels,
        remark: record.remark || "",
        ...getLocalDateTimeParts(record.occurredAt),
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法读取这条记录",
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
    const field = this.data.record.fieldSchemaSnapshot.find(
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

  onDateChange(event) {
    this.setData({
      occurredDate: event.detail.value,
      errorMessage: "",
    });
  },

  onTimeChange(event) {
    this.setData({
      occurredTime: event.detail.value,
      errorMessage: "",
    });
  },

  onRemarkInput(event) {
    this.setData({
      remark: event.detail.value,
      errorMessage: "",
    });
  },

  buildValues() {
    const values = {};

    for (const field of this.data.record.fieldSchemaSnapshot) {
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
        const numericValue = Number(normalized);

        if (!Number.isFinite(numericValue)) {
          throw new Error(`${field.label}必须是有效数字`);
        }
        values[field.key] = numericValue;
      } else {
        values[field.key] = normalized;
      }
    }

    return values;
  },

  async onSave() {
    if (this.data.saving || this.data.deleting) {
      return;
    }

    let values;
    let occurredAt;

    try {
      values = this.buildValues();
      occurredAt = new Date(
        `${this.data.occurredDate}T${this.data.occurredTime}:00`,
      );

      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error("请选择有效的记录时间");
      }
    } catch (error) {
      this.setData({
        errorMessage: error.message,
      });
      return;
    }

    this.setData({
      saving: true,
      errorMessage: "",
    });

    try {
      const result = await app.callHealthItemApi("updateHealthItem", {
        recordId: this.data.record.id,
        expectedRevision: this.data.record.revision,
        occurredAt: occurredAt.toISOString(),
        values,
        remark: this.data.remark,
      });
      this.setData({
        record: result.record,
        fieldValues: { ...result.record.values },
        remark: result.record.remark || "",
      });
      wx.showToast({
        title: "修改已保存",
        icon: "success",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "保存失败，请稍后重试",
      });
    } finally {
      this.setData({
        saving: false,
      });
    }
  },

  async onDelete() {
    if (this.data.saving || this.data.deleting) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "删除这条记录？",
        content: "删除后会从时间线隐藏，之后仍可在“已删除记录”中恢复。",
        confirmText: "删除",
        confirmColor: "#a14743",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });

    if (!confirmed) {
      return;
    }

    this.setData({
      deleting: true,
      errorMessage: "",
    });

    try {
      await app.callHealthItemApi("softDeleteItem", {
        recordId: this.data.record.id,
        expectedRevision: this.data.record.revision,
      });
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      this.setData({
        errorMessage: error.message || "删除失败，请稍后重试",
      });
    } finally {
      this.setData({
        deleting: false,
      });
    }
  },
});
