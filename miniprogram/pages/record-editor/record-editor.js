const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");
const {
  buildNotificationTimeValues,
  toNotificationTimeRows,
} = require("../../services/reminder-notification-times");

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

function getEditorCopy(mode, reminderId) {
  if (mode === "checkIn") {
    return {
      pageTitle: "提醒打卡",
      pageDescription: "填写实际结果，保存后提醒会标记为已打卡。",
      timeLabel: "实际发生时间",
      submitLabel: "完成打卡",
      remarkLabel: "本次记录备注（选填）",
    };
  }

  if (mode === "reminder") {
    return {
      pageTitle: reminderId ? "修改提醒" : "新建提醒",
      pageDescription: "设置计划时间；健康数据可以在打卡时再填写。",
      timeLabel: "计划时间",
      submitLabel: reminderId ? "保存修改" : "保存提醒",
      remarkLabel: "提醒备注（选填）",
    };
  }

  return {
    pageTitle: "快速记录",
    pageDescription: "选择记录对象和模板，只填写当前需要的内容。",
    timeLabel: "发生时间",
    submitLabel: "保存记录",
    remarkLabel: "备注（选填）",
  };
}

function buildChoiceState(template, values) {
  const fieldChoiceIndexes = {};
  const selectedChoiceLabels = {};

  for (const field of template.fields || []) {
    if (field.type !== "single_choice") {
      continue;
    }

    const optionIndex = (field.options || []).findIndex(
      (option) => option.key === values[field.key],
    );

    if (optionIndex >= 0) {
      fieldChoiceIndexes[field.key] = optionIndex;
      selectedChoiceLabels[field.key] =
        field.options[optionIndex].label;
    }
  }

  return {
    fieldChoiceIndexes,
    selectedChoiceLabels,
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
    notificationTimeRows: [],
    saving: false,
    errorMessage: "",
    showGoHome: false,
    mode: "record",
    reminderId: "",
    reminderRevision: 0,
    reminderRemark: "",
    pageTitle: "快速记录",
    pageDescription: "",
    timeLabel: "发生时间",
    submitLabel: "保存记录",
    remarkLabel: "备注（选填）",
    showModeSelector: false,
  },

  onLoad(options) {
    this._saveRequestId = "";
    const mode =
      options.mode === "reminder" || options.mode === "checkIn"
        ? options.mode
        : "record";
    const reminderId = options.reminderId || "";
    const showModeSelector =
      options.from === "quick-add" && !reminderId;
    const editorCopy = getEditorCopy(mode, reminderId);
    this.setData({
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
      mode,
      reminderId,
      ...editorCopy,
      ...(showModeSelector
        ? {
            pageTitle: "健康事项编辑",
            pageDescription:
              "选择记录或一次性提醒；周期提醒将在下一里程碑接入同一页面。",
          }
        : {}),
      showModeSelector,
      ...getLocalDateTimeParts(),
    });
    wx.setNavigationBarTitle({
      title: showModeSelector
        ? "健康事项编辑"
        : editorCopy.pageTitle,
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

  onModeSelect(event) {
    const mode = event.currentTarget.dataset.mode;

    if (
      this.data.saving ||
      this.data.reminderId ||
      mode === this.data.mode
    ) {
      return;
    }

    if (mode === "recurring") {
      wx.showToast({
        title: "周期提醒将在 M7 接入",
        icon: "none",
      });
      return;
    }

    if (mode !== "record" && mode !== "reminder") {
      return;
    }

    const editorCopy = getEditorCopy(mode, "");
    this.markChanged();
    this.setData({
      mode,
      ...editorCopy,
      pageTitle: "健康事项编辑",
      pageDescription:
        "选择记录或一次性提醒；周期提醒将在下一里程碑接入同一页面。",
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

  onAddNotificationTime() {
    this.markChanged();
    this.setData({
      notificationTimeRows: this.data.notificationTimeRows.concat([
        {
          date: this.data.occurredDate,
          time: this.data.occurredTime,
        },
      ]),
    });
  },

  onNotificationDateChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markChanged();
    this.setData({
      [`notificationTimeRows[${index}].date`]:
        event.detail.value,
    });
  },

  onNotificationTimeChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markChanged();
    this.setData({
      [`notificationTimeRows[${index}].time`]:
        event.detail.value,
    });
  },

  onRemoveNotificationTime(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markChanged();
    this.setData({
      notificationTimeRows: this.data.notificationTimeRows.filter(
        (row, rowIndex) => rowIndex !== index,
      ),
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
      const reminderResult = this.data.reminderId
        ? await app.callHealthItemApi("getHealthItem", {
            reminderId: this.data.reminderId,
          })
        : null;
      const reminder = reminderResult?.reminder;
      const selectedMemberIndex = Math.max(
        result.members.findIndex((member) =>
          reminder
            ? member.id === reminder.subjectUserId
            : member.isSelf,
        ),
        0,
      );
      const selectedTemplateIndex = Math.max(
        result.templates.findIndex(
          (template) =>
            template.id ===
            (reminder?.sourceTemplateId || "sys_temperature"),
        ),
        0,
      );

      if (!result.members.length || !result.templates.length) {
        throw new Error("当前家庭暂时没有可用的成员或记录模板");
      }

      const selectedTemplate = reminder
        ? {
            id: reminder.sourceTemplateId,
            sourceType: reminder.sourceTemplateType,
            name: reminder.templateNameSnapshot,
            fields: reminder.fieldSchemaSnapshot,
          }
        : result.templates[selectedTemplateIndex];
      const fieldValues = reminder?.values || {};
      const choiceState = buildChoiceState(
        selectedTemplate,
        fieldValues,
      );
      const reminderDateTime =
        reminder && this.data.mode === "reminder"
          ? getLocalDateTimeParts(new Date(reminder.plannedAt))
          : {};

      this.setData({
        status: "ready",
        familyName: result.family.name,
        members: result.members,
        templates: result.templates,
        selectedMemberIndex,
        selectedTemplateIndex,
        selectedMember: result.members[selectedMemberIndex],
        selectedTemplate,
        fieldValues,
        ...choiceState,
        temporaryFields: [],
        reminderRevision: reminder?.revision || 0,
        reminderRemark: reminder?.remark || "",
        notificationTimeRows:
          reminder && this.data.mode === "reminder"
            ? toNotificationTimeRows(
                reminder.notificationTimes || [],
              )
            : [],
        remark:
          reminder && this.data.mode === "reminder"
            ? reminder.remark || ""
            : "",
        ...reminderDateTime,
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法准备快速记录",
        showGoHome: error.code === "FAMILY_ACCESS_DENIED",
      });
    }
  },

  buildValues(requireAllFields = true) {
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
        if (field.required && requireAllFields) {
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
    let notificationTimes = [];

    try {
      values = this.buildValues(this.data.mode !== "reminder");
      temporaryFields =
        this.data.reminderId || this.data.mode === "checkIn"
          ? []
          : this.buildTemporaryFields();
      occurredAt = new Date(
        `${this.data.occurredDate}T${this.data.occurredTime}:00`,
      );

      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error("请选择有效的记录时间");
      }

      if (this.data.mode === "reminder") {
        notificationTimes = buildNotificationTimeValues(
          this.data.notificationTimeRows,
        );
      }
    } catch (error) {
      this.setData({
        errorMessage: error.message,
      });
      return;
    }

    this._saveRequestId =
      this._saveRequestId ||
      `${this.data.mode}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    this.setData({
      saving: true,
      errorMessage: "",
    });

    try {
      if (this.data.mode === "checkIn") {
        await app.callHealthItemApi(
          "checkInReminder",
          {
            reminderId: this.data.reminderId,
            expectedRevision: this.data.reminderRevision,
            occurredAt: occurredAt.toISOString(),
            values,
            remark: this.data.remark,
          },
          this._saveRequestId,
        );
      } else if (this.data.mode === "reminder") {
        const reminderData = {
          familyId: this.data.familyId,
          subjectUserId: this.data.selectedMember.id,
          sourceTemplateType: this.data.selectedTemplate.sourceType,
          sourceTemplateId: this.data.selectedTemplate.id,
          plannedAt: occurredAt.toISOString(),
          notificationTimes,
          values,
          remark: this.data.remark,
        };

        if (this.data.reminderId) {
          await app.callHealthItemApi(
            "updateHealthItem",
            {
              reminderId: this.data.reminderId,
              expectedRevision: this.data.reminderRevision,
              plannedAt: reminderData.plannedAt,
              notificationTimes,
              values,
              remark: this.data.remark,
            },
            this._saveRequestId,
          );
        } else {
          await app.callHealthItemApi(
            "createReminder",
            {
              ...reminderData,
              temporaryFields,
            },
            this._saveRequestId,
          );
        }
      } else {
        await app.callHealthItemApi(
          "createRecord",
          {
            familyId: this.data.familyId,
            subjectUserId: this.data.selectedMember.id,
            sourceTemplateType:
              this.data.selectedTemplate.sourceType,
            sourceTemplateId: this.data.selectedTemplate.id,
            occurredAt: occurredAt.toISOString(),
            values,
            temporaryFields,
            remark: this.data.remark,
          },
          this._saveRequestId,
        );
      }
      wx.showToast({
        title:
          this.data.mode === "checkIn"
            ? "打卡成功"
            : this.data.mode === "reminder"
              ? "提醒已保存"
              : "记录已保存",
        icon: "success",
      });
      wx.switchTab({
        url:
          this.data.mode === "record"
            ? "/pages/records/records"
            : "/pages/daily-health/daily-health",
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
