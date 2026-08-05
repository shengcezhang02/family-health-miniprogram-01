const app = getApp();

const FIELD_TYPES = [
  { value: "short_text", label: "简短文字" },
  { value: "number", label: "数字" },
  { value: "single_choice", label: "单选" },
];

const COLOR_OPTIONS = [
  { value: "rose", label: "柔和红" },
  { value: "blue", label: "湖蓝" },
  { value: "green", label: "青绿" },
  { value: "amber", label: "暖金" },
  { value: "purple", label: "灰紫" },
  { value: "teal", label: "深青" },
];
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function getColorPreviewStyle(colorKey, colorHex) {
  return colorKey === "custom" && HEX_COLOR_PATTERN.test(colorHex || "")
    ? `background: ${colorHex.toUpperCase()};`
    : "";
}

function createBlankField() {
  return {
    key: "",
    label: "",
    type: "short_text",
    typeIndex: 0,
    unit: "",
    required: false,
    status: "active",
    options: [],
  };
}

function toFormField(field) {
  return {
    ...field,
    key: field.key || "",
    typeIndex: Math.max(
      FIELD_TYPES.findIndex((item) => item.value === field.type),
      0,
    ),
    unit: field.unit || "",
    options: (field.options || []).map((option) => ({ ...option })),
  };
}

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    customTemplates: [],
    showForm: false,
    editingTemplateId: "",
    expectedRevision: 0,
    formName: "",
    formColorKey: "purple",
    formColorHex: "",
    formColorPreviewStyle: "",
    colorOptions: COLOR_OPTIONS,
    formFields: [],
    fieldTypeLabels: FIELD_TYPES.map((item) => item.label),
    saving: false,
    changingStatusId: "",
    errorMessage: "",
  },

  onLoad(options) {
    this._openCreateOnReady = options.mode === "create";
    this.setData({
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
    });
  },

  onShow() {
    if (!this.data.showForm) {
      this.loadTemplates();
    }
  },

  onRetry() {
    this.loadTemplates();
  },

  async loadTemplates() {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
    });

    try {
      const result = await app.callTemplateApi("listTemplates", {
        familyId: this.data.familyId,
        includeInactive: true,
      });
      this.setData({
        status: "ready",
        customTemplates: result.templates
          .filter((template) => template.sourceType === "custom")
          .map((template) => ({
            ...template,
            colorKey: template.colorKey || "purple",
            colorPreviewStyle: getColorPreviewStyle(
              template.colorKey,
              template.colorHex,
            ),
          })),
      });
      if (this._openCreateOnReady) {
        this._openCreateOnReady = false;
        this.onCreateTemplate();
      }
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法读取自定义模板",
      });
    }
  },

  onCreateTemplate() {
    this.setData({
      showForm: true,
      editingTemplateId: "",
      expectedRevision: 0,
      formName: "",
      formColorKey: "purple",
      formColorHex: "",
      formColorPreviewStyle: "",
      formFields: [createBlankField()],
      errorMessage: "",
    });
  },

  onEditTemplate(event) {
    const template = this.data.customTemplates.find(
      (item) => item.id === event.currentTarget.dataset.templateId,
    );

    if (!template) {
      return;
    }

    this.setData({
      showForm: true,
      editingTemplateId: template.id,
      expectedRevision: template.revision,
      formName: template.name,
      formColorKey: template.colorKey || "purple",
      formColorHex: template.colorHex || "",
      formColorPreviewStyle: getColorPreviewStyle(
        template.colorKey,
        template.colorHex,
      ),
      formFields: template.fields.map(toFormField),
      errorMessage: "",
    });
  },

  onCancelForm() {
    if (this.data.saving) {
      return;
    }

    this.setData({
      showForm: false,
      editingTemplateId: "",
      formFields: [],
      errorMessage: "",
    });
  },

  onNameInput(event) {
    this.setData({
      formName: event.detail.value,
      errorMessage: "",
    });
  },

  onColorSelect(event) {
    if (this.data.saving) {
      return;
    }

    const colorKey = event.currentTarget.dataset.colorKey;
    if (!COLOR_OPTIONS.some((option) => option.value === colorKey)) {
      return;
    }

    this.setData({
      formColorKey: colorKey,
      formColorHex: "",
      formColorPreviewStyle: "",
      errorMessage: "",
    });
  },

  onColorCodeInput(event) {
    const formColorHex = event.detail.value;
    const normalizedHex = formColorHex.trim().toUpperCase();
    const isValid = HEX_COLOR_PATTERN.test(normalizedHex);
    this.setData({
      formColorHex,
      ...(isValid ? { formColorKey: "custom" } : {}),
      formColorPreviewStyle: isValid
        ? `background: ${normalizedHex};`
        : "",
      errorMessage: "",
    });
  },

  onFieldInput(event) {
    const index = Number(event.currentTarget.dataset.index);
    const property = event.currentTarget.dataset.property;
    this.setData({
      [`formFields[${index}].${property}`]: event.detail.value,
      errorMessage: "",
    });
  },

  onFieldTypeChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    const typeIndex = Number(event.detail.value);
    const type = FIELD_TYPES[typeIndex].value;
    const updates = {
      [`formFields[${index}].typeIndex`]: typeIndex,
      [`formFields[${index}].type`]: type,
      errorMessage: "",
    };

    if (
      type === "single_choice" &&
      this.data.formFields[index].options.length < 2
    ) {
      updates[`formFields[${index}].options`] = [
        { key: "", label: "", status: "active" },
        { key: "", label: "", status: "active" },
      ];
    }

    this.setData(updates);
  },

  onFieldRequiredChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`formFields[${index}].required`]: event.detail.value,
      errorMessage: "",
    });
  },

  onFieldStatusChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({
      [`formFields[${index}].status`]: event.detail.value
        ? "active"
        : "inactive",
      errorMessage: "",
    });
  },

  onAddField() {
    if (this.data.formFields.length >= 10) {
      return;
    }

    this.setData({
      formFields: this.data.formFields.concat([createBlankField()]),
      errorMessage: "",
    });
  },

  onRemoveField(event) {
    const index = Number(event.currentTarget.dataset.index);
    const field = this.data.formFields[index];

    if (field?.key || this.data.formFields.length <= 1) {
      return;
    }

    this.setData({
      formFields: this.data.formFields.filter(
        (item, fieldIndex) => fieldIndex !== index,
      ),
      errorMessage: "",
    });
  },

  onOptionInput(event) {
    const fieldIndex = Number(event.currentTarget.dataset.fieldIndex);
    const optionIndex = Number(event.currentTarget.dataset.optionIndex);
    this.setData({
      [`formFields[${fieldIndex}].options[${optionIndex}].label`]:
        event.detail.value,
      errorMessage: "",
    });
  },

  onOptionStatusChange(event) {
    const fieldIndex = Number(event.currentTarget.dataset.fieldIndex);
    const optionIndex = Number(event.currentTarget.dataset.optionIndex);
    this.setData({
      [`formFields[${fieldIndex}].options[${optionIndex}].status`]:
        event.detail.value ? "active" : "inactive",
      errorMessage: "",
    });
  },

  onAddOption(event) {
    const fieldIndex = Number(event.currentTarget.dataset.fieldIndex);
    const options = this.data.formFields[fieldIndex].options;

    if (options.length >= 10) {
      return;
    }

    this.setData({
      [`formFields[${fieldIndex}].options`]: options.concat([
        { key: "", label: "", status: "active" },
      ]),
      errorMessage: "",
    });
  },

  onRemoveOption(event) {
    const fieldIndex = Number(event.currentTarget.dataset.fieldIndex);
    const optionIndex = Number(event.currentTarget.dataset.optionIndex);
    const options = this.data.formFields[fieldIndex].options;

    if (options[optionIndex]?.key || options.length <= 2) {
      return;
    }

    this.setData({
      [`formFields[${fieldIndex}].options`]: options.filter(
        (item, index) => index !== optionIndex,
      ),
      errorMessage: "",
    });
  },

  buildFields() {
    return this.data.formFields.map((field) => {
      const label = field.label.trim();

      if (!label) {
        throw new Error("请填写每个字段的名称");
      }

      const normalized = {
        ...(field.key ? { key: field.key } : {}),
        label,
        type: field.type,
        required: field.required,
        status: field.status,
        ...(field.type === "number" && field.unit.trim()
          ? { unit: field.unit.trim() }
          : {}),
      };

      if (field.type === "single_choice") {
        normalized.options = field.options.map((option) => {
          const optionLabel = option.label.trim();

          if (!optionLabel) {
            throw new Error("请填写每个单选项的名称");
          }

          return {
            ...(option.key ? { key: option.key } : {}),
            label: optionLabel,
            status: option.status,
          };
        });
      }

      return normalized;
    });
  },

  async onSaveTemplate() {
    if (this.data.saving) {
      return;
    }

    let fields;
    const name = this.data.formName.trim();
    const colorHex = this.data.formColorHex.trim().toUpperCase();
    const hasCustomColor = colorHex.length > 0;

    try {
      if (!name) {
        throw new Error("请填写模板名称");
      }
      if (hasCustomColor && !HEX_COLOR_PATTERN.test(colorHex)) {
        throw new Error("颜色代码应为 # 加 6 位字符，例如 #3A7F91");
      }
      fields = this.buildFields();
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
      if (this.data.editingTemplateId) {
        await app.callTemplateApi("updateCustomTemplate", {
          familyId: this.data.familyId,
          templateId: this.data.editingTemplateId,
          expectedRevision: this.data.expectedRevision,
          name,
          colorKey: hasCustomColor ? "custom" : this.data.formColorKey,
          ...(hasCustomColor ? { colorHex } : {}),
          fields,
        });
      } else {
        await app.callTemplateApi("createCustomTemplate", {
          familyId: this.data.familyId,
          name,
          colorKey: hasCustomColor ? "custom" : this.data.formColorKey,
          ...(hasCustomColor ? { colorHex } : {}),
          fields,
        });
      }

      this.setData({
        showForm: false,
        editingTemplateId: "",
        formFields: [],
      });
      wx.showToast({
        title: "模板已保存",
        icon: "success",
      });
      await this.loadTemplates();
    } catch (error) {
      this.setData({
        errorMessage: error.message || "保存模板失败，请稍后重试",
      });
    } finally {
      this.setData({
        saving: false,
      });
    }
  },

  async onToggleTemplateStatus(event) {
    const template = this.data.customTemplates.find(
      (item) => item.id === event.currentTarget.dataset.templateId,
    );

    if (!template || this.data.changingStatusId) {
      return;
    }

    this.setData({
      changingStatusId: template.id,
      errorMessage: "",
    });

    try {
      await app.callTemplateApi("setTemplateStatus", {
        familyId: this.data.familyId,
        templateId: template.id,
        expectedRevision: template.revision,
        status: template.status === "active" ? "inactive" : "active",
      });
      await this.loadTemplates();
    } catch (error) {
      this.setData({
        errorMessage: error.message || "更改模板状态失败",
      });
    } finally {
      this.setData({
        changingStatusId: "",
      });
    }
  },
});
