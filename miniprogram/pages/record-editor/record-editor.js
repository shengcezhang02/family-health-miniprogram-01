const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");

const recordPageLoader = createRecordPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }) =>
    app.callTemplateApi("listTemplates", { familyId }),
  getRecordTimeline: ({ familyId }) =>
    app.callQueryApi("getRecordTimeline", { familyId }),
});

function pad(value) {
  return String(value).padStart(2, "0");
}

function getLocalDateTimeParts(date = new Date()) {
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
    familyId: "",
    familyName: "",
    members: [],
    templates: [],
    selectedMemberIndex: 0,
    selectedTemplateIndex: 0,
    selectedMember: null,
    selectedTemplate: null,
    fieldValues: {},
    fieldChoiceIndexes: {},
    selectedChoiceLabels: {},
    temporaryFields: [],
    remark: "",
    occurredDate: "",
    occurredTime: "",
    saving: false,
    errorMessage: "",
    showGoHome: false,
  },

  onLoad(options) {
    this._saveRequestId = "";
    this.setData({
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
      ...getLocalDateTimeParts(),
    });
    this.loadEditor();
  },

  onRetry() {
    this.loadEditor();
  },

  onGoHome() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  markChanged() {
    this._saveRequestId = "";
    this.setData({
      errorMessage: "",
    });
  },

  onMemberChange(event) {
    const selectedMemberIndex = Number(event.detail.value);
    this.markChanged();
    this.setData({
      selectedMemberIndex,
      selectedMember: this.data.members[selectedMemberIndex],
    });
  },

  onTemplateChange(event) {
    const selectedTemplateIndex = Number(event.detail.value);
    this.markChanged();
    this.setData({
      selectedTemplateIndex,
      selectedTemplate: this.data.templates[selectedTemplateIndex],
      fieldValues: {},
      fieldChoiceIndexes: {},
      selectedChoiceLabels: {},
    });
  },

  onFieldInput(event) {
    const fieldKey = event.currentTarget.dataset.fieldKey;
    this.markChanged();
    this.setData({
      [`fieldValues.${fieldKey}`]: event.detail.value,
    });
  },

  onChoiceChange(event) {
    const fieldKey = event.currentTarget.dataset.fieldKey;
    const optionIndex = Number(event.detail.value);
    const field = this.data.selectedTemplate.fields.find(
      (candidate) => candidate.key === fieldKey,
    );
    const option = field?.options?.[optionIndex];

    if (!option) {
      return;
    }

    this.markChanged();
    this.setData({
      [`fieldValues.${fieldKey}`]: option.key,
      [`fieldChoiceIndexes.${fieldKey}`]: optionIndex,
      [`selectedChoiceLabels.${fieldKey}`]: option.label,
    });
  },

  onAddTemporaryField() {
    if (this.data.temporaryFields.length >= 3) {
      return;
    }

    this.markChanged();
    this.setData({
      temporaryFields: this.data.temporaryFields.concat([
        {
          label: "",
          value: "",
        },
      ]),
    });
  },

  onTemporaryFieldInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const property = event.currentTarget.dataset.property;
    this.markChanged();
    this.setData({
      [`temporaryFields[${index}].${property}`]: event.detail.value,
    });
  },

  onRemoveTemporaryField(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markChanged();
    this.setData({
      temporaryFields: this.data.temporaryFields.filter(
        (field, fieldIndex) => fieldIndex !== index,
      ),
    });
  },

  onDateChange(event) {
    this.markChanged();
    this.setData({
      occurredDate: event.detail.value,
    });
  },

  onTimeChange(event) {
    this.markChanged();
    this.setData({
      occurredTime: event.detail.value,
    });
  },

  onRemarkInput(event) {
    this.markChanged();
    this.setData({
      remark: event.detail.value,
    });
  },

  async loadEditor() {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
        showGoHome: true,
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
      showGoHome: false,
    });

    try {
      const result = await recordPageLoader.loadEditor(
        this.data.familyId,
      );
      const selectedMemberIndex = Math.max(
        result.members.findIndex((member) => member.isSelf),
        0,
      );
      const selectedTemplateIndex = Math.max(
        result.templates.findIndex(
          (template) => template.id === "sys_temperature",
        ),
        0,
      );

      if (!result.members.length || !result.templates.length) {
        throw new Error("当前家庭暂时没有可用的成员或记录模板");
      }

      this.setData({
        status: "ready",
        familyName: result.family.name,
        members: result.members,
        templates: result.templates,
        selectedMemberIndex,
        selectedTemplateIndex,
        selectedMember: result.members[selectedMemberIndex],
        selectedTemplate: result.templates[selectedTemplateIndex],
        fieldValues: {},
        fieldChoiceIndexes: {},
        selectedChoiceLabels: {},
        temporaryFields: [],
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法准备快速记录",
        showGoHome: error.code === "FAMILY_ACCESS_DENIED",
      });
    }
  },

  buildValues() {
    const values = {};

    for (const field of this.data.selectedTemplate.fields) {
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

  buildTemporaryFields() {
    return this.data.temporaryFields.map((field) => {
      const label = field.label.trim();
      const value = field.value.trim();

      if (!label) {
        throw new Error("请填写临时字段名称");
      }

      return {
        label,
        value,
      };
    });
  },

  async onSave() {
    if (this.data.saving || !this.data.selectedTemplate) {
      return;
    }

    let values;
    let temporaryFields;
    let occurredAt;

    try {
      values = this.buildValues();
      temporaryFields = this.buildTemporaryFields();
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

    this._saveRequestId =
      this._saveRequestId ||
      `createRecord-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    this.setData({
      saving: true,
      errorMessage: "",
    });

    try {
      await app.callHealthItemApi(
        "createRecord",
        {
          familyId: this.data.familyId,
          subjectUserId: this.data.selectedMember.id,
          sourceTemplateType: this.data.selectedTemplate.sourceType,
          sourceTemplateId: this.data.selectedTemplate.id,
          occurredAt: occurredAt.toISOString(),
          values,
          temporaryFields,
          remark: this.data.remark,
        },
        this._saveRequestId,
      );
      wx.showToast({
        title: "记录已保存",
        icon: "success",
      });
      wx.redirectTo({
        url: `/pages/records/records?familyId=${
          this.data.familyId
        }&familyName=${encodeURIComponent(this.data.familyName)}`,
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
});
