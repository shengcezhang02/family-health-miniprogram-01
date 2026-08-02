const app = getApp();
const {
  createRecordPageLoader,
} = require("../../services/record-page-loader");
const {
  buildNotificationTimeValues,
  toNotificationTimeRows,
} = require("../../services/reminder-notification-times");
const {
  REPEAT_TYPES,
  buildRecurringScheduleInput,
  toRecurringFormState,
} = require("../../services/recurring-rule-form");
const {
  completeHealthItemSave,
} = require("../../services/health-item-save-feedback");

const recordPageLoader = createRecordPageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
  listTemplates: ({ familyId }) =>
    app.callTemplateApi("listTemplates", { familyId }),
  getRecordTimeline: ({ familyId }) =>
    app.callQueryApi("getRecordTimeline", { familyId }),
  getCachedFamily: (familyId) =>
    app.getCachedFamily(familyId),
  getCachedFamilyMembers: ({ familyId }) =>
    app.getCachedCloudApi("profile-api", "listFamilyMembers", {
      familyId,
    }),
  getCachedTemplates: ({ familyId }) =>
    app.getCachedCloudApi("template-api", "listTemplates", {
      familyId,
    }),
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

  if (mode === "recurring") {
    return {
      pageTitle: "周期提醒",
      pageDescription:
        "设置日期范围、重复方式和每天的提醒时间。",
      timeLabel: "周期安排",
      submitLabel: "保存周期规则",
      remarkLabel: "规则备注（选填）",
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

function getDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getDefaultRecurringState(date = new Date()) {
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 29);

  return {
    startDate: getDateString(date),
    endDate: getDateString(endDate),
    repeatType: "daily",
    repeatTypeIndex: 0,
    weekdays: [],
    intervalDays: "",
    dailyTimeRows: [
      {
        time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
      },
    ],
  };
}

function getWeekdayOptions(selectedWeekdays = []) {
  return ["一", "二", "三", "四", "五", "六", "日"].map(
    (label, index) => ({
      value: index + 1,
      label,
      selected: selectedWeekdays.includes(index + 1),
    }),
  );
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
    formLocked: true,
    syncNotice: "",
    errorMessage: "",
    showGoHome: false,
    mode: "record",
    reminderId: "",
    reminderRevision: 0,
    reminderRemark: "",
    ruleId: "",
    requestedTemplateId: "",
    ruleRevision: 0,
    ruleStatus: "",
    repeatTypes: REPEAT_TYPES,
    repeatType: "daily",
    repeatTypeIndex: 0,
    weekdayOptions: getWeekdayOptions(),
    weekdays: [],
    intervalDays: "",
    startDate: "",
    endDate: "",
    dailyTimeRows: [],
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
      options.mode === "reminder" ||
      options.mode === "checkIn" ||
      options.mode === "recurring"
        ? options.mode
        : "record";
    const reminderId = options.reminderId || "";
    const ruleId = options.ruleId || "";
    const showModeSelector =
      options.from === "quick-add" && !reminderId && !ruleId;
    const editorCopy = getEditorCopy(mode, reminderId);
    const recurringState = getDefaultRecurringState();
    this.setData({
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
      mode,
      reminderId,
      ruleId,
      requestedTemplateId: options.templateId || "",
      ...editorCopy,
      ...(showModeSelector
        ? {
            pageTitle: "健康事项编辑",
            pageDescription:
              "记录、一次性提醒和周期提醒都从这里创建。",
          }
        : {}),
      showModeSelector,
      ...getLocalDateTimeParts(),
      ...recurringState,
      weekdayOptions: getWeekdayOptions(recurringState.weekdays),
    });
    wx.setNavigationBarTitle({
      title: showModeSelector
        ? "健康事项编辑"
        : editorCopy.pageTitle,
    });

    const startupSnapshot =
      !reminderId && !ruleId
        ? recordPageLoader.getEditorStartupSnapshot(
            options.familyId || "",
          )
        : undefined;
    if (startupSnapshot) {
      this.applyEditorResult(startupSnapshot, {
        fromCache: true,
      });
    }
    this.loadEditor({
      silent: Boolean(startupSnapshot),
    });
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
      this.data.formLocked ||
      this.data.reminderId ||
      this.data.ruleId ||
      mode === this.data.mode
    ) {
      return;
    }

    if (
      mode !== "record" &&
      mode !== "reminder" &&
      mode !== "recurring"
    ) {
      return;
    }

    const editorCopy = getEditorCopy(mode, "");
    const recurringState =
      mode === "recurring" ? getDefaultRecurringState() : {};
    this.markChanged();
    this.setData({
      mode,
      ...editorCopy,
      ...recurringState,
      ...(mode === "recurring"
        ? {
            weekdayOptions: getWeekdayOptions(
              recurringState.weekdays,
            ),
          }
        : {}),
      pageTitle: "健康事项编辑",
      pageDescription:
        "记录、一次性提醒和周期提醒都从这里创建。",
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

  onStartDateChange(event) {
    this.markChanged();
    this.setData({
      startDate: event.detail.value,
    });
  },

  onEndDateChange(event) {
    this.markChanged();
    this.setData({
      endDate: event.detail.value,
    });
  },

  onRepeatTypeChange(event) {
    const repeatTypeIndex = Number(event.detail.value);
    this.markChanged();
    this.setData({
      repeatTypeIndex,
      repeatType: REPEAT_TYPES[repeatTypeIndex].value,
    });
  },

  onToggleWeekday(event) {
    const weekday = Number(event.currentTarget.dataset.weekday);
    const weekdays = this.data.weekdays.includes(weekday)
      ? this.data.weekdays.filter((value) => value !== weekday)
      : this.data.weekdays.concat([weekday]).sort();
    this.markChanged();
    this.setData({
      weekdays,
      weekdayOptions: getWeekdayOptions(weekdays),
    });
  },

  onIntervalDaysInput(event) {
    this.markChanged();
    this.setData({
      intervalDays: event.detail.value,
    });
  },

  onAddDailyTime() {
    this.markChanged();
    this.setData({
      dailyTimeRows: this.data.dailyTimeRows.concat([
        {
          time: this.data.occurredTime,
        },
      ]),
    });
  },

  onDailyTimeChange(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markChanged();
    this.setData({
      [`dailyTimeRows[${index}].time`]: event.detail.value,
    });
  },

  onRemoveDailyTime(event) {
    const index = Number(event.currentTarget.dataset.index);

    if (this.data.dailyTimeRows.length <= 1) {
      return;
    }

    this.markChanged();
    this.setData({
      dailyTimeRows: this.data.dailyTimeRows.filter(
        (row, rowIndex) => rowIndex !== index,
      ),
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

  applyEditorResult(result, { fromCache = false } = {}) {
    const reminder = result.existingItemResult?.reminder;
    const rule = result.existingItemResult?.rule;
    const existingItem = reminder || rule;
    const selectedMemberIndex = Math.max(
      result.members.findIndex((member) =>
        existingItem
          ? member.id === existingItem.subjectUserId
          : member.isSelf,
      ),
      0,
    );
    const selectedTemplateIndex = Math.max(
      result.templates.findIndex(
        (template) =>
          template.id ===
          (existingItem?.sourceTemplateId ||
            this.data.requestedTemplateId ||
            "sys_temperature"),
      ),
      0,
    );

    if (!result.members.length || !result.templates.length) {
      throw new Error("当前家庭暂时没有可用的成员或记录模板");
    }

    const selectedTemplate = existingItem
      ? {
          id: existingItem.sourceTemplateId,
          sourceType: existingItem.sourceTemplateType,
          name: existingItem.templateNameSnapshot,
          fields: existingItem.fieldSchemaSnapshot,
        }
      : result.templates[selectedTemplateIndex];
    const fieldValues = existingItem?.values || {};
    const choiceState = buildChoiceState(
      selectedTemplate,
      fieldValues,
    );
    const reminderDateTime =
      reminder && this.data.mode === "reminder"
        ? getLocalDateTimeParts(new Date(reminder.plannedAt))
        : {};
    const recurringState = rule
      ? toRecurringFormState(rule)
      : {};

    this.setData({
      status: "ready",
      formLocked: fromCache,
      syncNotice: fromCache
        ? "正在同步最新表单，完成前只能查看"
        : "",
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
      ruleRevision: rule?.revision || 0,
      ruleStatus: rule?.status || "",
      notificationTimeRows:
        reminder && this.data.mode === "reminder"
          ? toNotificationTimeRows(
              reminder.notificationTimes || [],
            )
          : [],
      remark:
        existingItem &&
        (this.data.mode === "reminder" ||
          this.data.mode === "recurring")
          ? existingItem.remark || ""
          : "",
      ...reminderDateTime,
      ...recurringState,
      ...(rule
        ? {
            weekdayOptions: getWeekdayOptions(
              recurringState.weekdays,
            ),
          }
        : {}),
    });
  },

  async loadEditor({ silent = false } = {}) {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
        showGoHome: true,
      });
      return;
    }

    this.setData(
      silent
        ? {
            formLocked: true,
            syncNotice: "正在同步最新表单，完成前只能查看",
            errorMessage: "",
            showGoHome: false,
          }
        : {
            status: "loading",
            formLocked: true,
            syncNotice: "正在准备表单…",
            errorMessage: "",
            showGoHome: false,
          },
    );

    try {
      const result = await recordPageLoader.loadEditor(
        this.data.familyId,
        {
          loadExistingItem: () => {
            if (this.data.reminderId) {
              return app.callHealthItemApi("getHealthItem", {
                familyId: this.data.familyId,
                reminderId: this.data.reminderId,
              });
            }
            if (this.data.ruleId) {
              return app.callHealthItemApi("getHealthItem", {
                familyId: this.data.familyId,
                ruleId: this.data.ruleId,
              });
            }
            return null;
          },
        },
      );
      this.applyEditorResult(result);
    } catch (error) {
      if (silent && this.data.status === "ready") {
        this.setData({
          formLocked: true,
          syncNotice: "同步失败，当前表单暂不可保存",
        });
        return;
      }

      this.setData({
        status: "error",
        formLocked: true,
        syncNotice: "",
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
    if (
      this.data.saving ||
      this.data.formLocked ||
      !this.data.selectedTemplate
    ) {
      if (this.data.formLocked) {
        wx.showToast({
          title: "云端同步完成后才能保存",
          icon: "none",
        });
      }
      return;
    }

    let values;
    let temporaryFields;
    let occurredAt;
    let notificationTimes = [];
    let recurringSchedule;

    try {
      values = this.buildValues(
        this.data.mode === "record" ||
          this.data.mode === "checkIn",
      );
      temporaryFields =
        this.data.reminderId ||
        this.data.ruleId ||
        this.data.mode === "checkIn"
          ? []
          : this.buildTemporaryFields();

      if (this.data.mode === "recurring") {
        recurringSchedule = buildRecurringScheduleInput({
          startDate: this.data.startDate,
          endDate: this.data.endDate,
          repeatType: this.data.repeatType,
          weekdays: this.data.weekdays,
          intervalDays: this.data.intervalDays,
          dailyTimeRows: this.data.dailyTimeRows,
        });
      } else {
        occurredAt = new Date(
          `${this.data.occurredDate}T${this.data.occurredTime}:00`,
        );

        if (Number.isNaN(occurredAt.getTime())) {
          throw new Error("请选择有效的记录时间");
        }
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
      } else if (this.data.mode === "recurring") {
        const recurringData = {
          values,
          remark: this.data.remark,
          ...recurringSchedule,
        };

        if (this.data.ruleId) {
          await app.callHealthItemApi(
            "updateHealthItem",
            {
              ruleId: this.data.ruleId,
              expectedRevision: this.data.ruleRevision,
              ...recurringData,
            },
            this._saveRequestId,
          );
        } else {
          await app.callHealthItemApi(
            "createRecurringRule",
            {
              familyId: this.data.familyId,
              subjectUserId: this.data.selectedMember.id,
              sourceTemplateType:
                this.data.selectedTemplate.sourceType,
              sourceTemplateId: this.data.selectedTemplate.id,
              temporaryFields,
              ...recurringData,
            },
            this._saveRequestId,
          );
        }

        try {
          await app.callReminderMaterializer({
            familyId: this.data.familyId,
          });
        } catch (materializerError) {
          console.warn(
            "周期规则已保存，未来提醒稍后补齐",
            materializerError,
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
      await completeHealthItemSave({
        mode: this.data.mode,
        showToast: (options) => wx.showToast(options),
        navigate: (url) =>
          wx.switchTab({
            url,
          }),
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

  async onToggleRuleStatus() {
    if (
      this.data.saving ||
      !this.data.ruleId ||
      !this.data.ruleRevision
    ) {
      return;
    }

    const action =
      this.data.ruleStatus === "paused" ? "resumeRule" : "pauseRule";
    this.setData({
      saving: true,
      errorMessage: "",
    });

    try {
      const result = await app.callHealthItemApi(action, {
        ruleId: this.data.ruleId,
        expectedRevision: this.data.ruleRevision,
      });
      await app.callReminderMaterializer({
        familyId: this.data.familyId,
      });
      this.setData({
        ruleStatus: result.rule.status,
        ruleRevision: result.rule.revision,
      });
      wx.showToast({
        title:
          result.rule.status === "paused"
            ? "已暂停"
            : "已恢复",
        icon: "success",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "状态修改失败，请稍后重试",
      });
    } finally {
      this.setData({
        saving: false,
      });
    }
  },
});
