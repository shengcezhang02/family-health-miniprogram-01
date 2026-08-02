const app = getApp();
const {
  createDashboardCardStore,
} = require("../../services/dashboard-card-store");
const {
  buildDashboardCardViews,
} = require("../../services/dashboard-card-view");
const {
  resolveTemplateSelection,
} = require("../../services/dashboard-card-editor-options");

const TYPE_OPTIONS = [
  { value: "trend", label: "趋势", title: "健康趋势" },
  {
    value: "record_list",
    label: "记录列表",
    title: "近期记录",
  },
  {
    value: "latest_data",
    label: "最新数据",
    title: "最新数据",
  },
  {
    value: "reminder_completion",
    label: "提醒完成",
    title: "提醒完成",
  },
  {
    value: "recurring_rules",
    label: "周期提醒",
    title: "周期提醒",
  },
];
const TIME_RANGE_OPTIONS = [
  { value: "7d", label: "近7天" },
  { value: "30d", label: "近30天" },
  { value: "90d", label: "近90天" },
  { value: "all", label: "全部时间" },
];

const dashboardCardStore = createDashboardCardStore({
  get: (key) => wx.getStorageSync(key),
  set: (key, value) => wx.setStorageSync(key, value),
  remove: (key) => wx.removeStorageSync(key),
});

function getDefaultDraft(type) {
  const option =
    TYPE_OPTIONS.find((candidate) => candidate.value === type) ||
    TYPE_OPTIONS[1];

  return {
    id: "",
    type: option.value,
    title: option.title,
    memberIds: [],
    templateId: "",
    timeRange:
      option.value === "recurring_rules" ? "all" : "30d",
    fieldKeys: [],
  };
}

function addDisplayLabels(members) {
  let familyNumber = 0;

  return members.map((member) => {
    if (member.isSelf) {
      return {
        ...member,
        displayLabel: `${member.displayName}（我）`,
      };
    }

    familyNumber += 1;
    return {
      ...member,
      displayLabel: `${member.displayName}（家人 ${familyNumber}）`,
    };
  });
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${String(
    date.getHours(),
  ).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getFieldDisplayValue(record, field) {
  const rawValue = record.values?.[field.key];
  const option = (field.options || []).find(
    (candidate) => candidate.key === rawValue,
  );
  return `${option?.label ?? rawValue}${field.unit || ""}`;
}

function formatPreview(view) {
  if (view.type === "record_list") {
    return {
      ...view,
      items: view.items.slice(0, 5).map((record) => ({
        ...record,
        displayTime: formatDateTime(record.occurredAt),
        displayValues: (record.fieldSchemaSnapshot || [])
          .filter(
            (field) =>
              (view.fieldKeys.length === 0 ||
                view.fieldKeys.includes(field.key)) &&
              Object.prototype.hasOwnProperty.call(
                record.values || {},
                field.key,
              ),
          )
          .map((field) => getFieldDisplayValue(record, field))
          .join(" · "),
      })),
    };
  }

  if (view.type === "latest_data") {
    return {
      ...view,
      items: view.items.map((item) => ({
        ...item,
        displayTime: formatDateTime(item.record.occurredAt),
        values: item.values.map((value) => ({
          ...value,
          displayValue: `${value.value}${value.unit}`,
          changeLabel:
            value.change === undefined
              ? "暂无上次数据"
              : value.change === 0
                ? "与上次相同"
                : `较上次${value.change > 0 ? "+" : ""}${
                    value.change
                  }${value.unit}`,
        })),
      })),
    };
  }

  if (view.type === "trend") {
    return {
      ...view,
      series: view.series.map((series) => ({
        ...series,
        latestValue: series.points.length
          ? `${series.points[series.points.length - 1].value}${
              series.unit
            }`
          : "",
      })),
    };
  }

  if (view.type === "reminder_completion") {
    return {
      ...view,
      items: view.items.slice(0, 5).map((reminder) => ({
        ...reminder,
        displayTime: formatDateTime(reminder.plannedAt),
      })),
    };
  }

  return {
    ...view,
    items: view.items.slice(0, 5),
  };
}

Page({
  data: {
    status: "loading",
    mode: "create",
    userId: "",
    familyId: "",
    familyName: "当前家庭",
    cardId: "",
    typeOptions: TYPE_OPTIONS,
    timeRangeOptions: TIME_RANGE_OPTIONS,
    timeRangeIndex: 1,
    draft: getDefaultDraft("record_list"),
    members: [],
    selectedMemberIds: [],
    templates: [],
    templateOptions: [],
    templateIndex: 0,
    fieldOptions: [],
    selectedFieldKeys: [],
    preview: null,
    saving: false,
    errorMessage: "",
  },

  onLoad(options) {
    const type = TYPE_OPTIONS.some(
      (candidate) => candidate.value === options.type,
    )
      ? options.type
      : "record_list";
    this.setData({
      mode: options.cardId ? "edit" : "create",
      userId: options.userId || "",
      familyId: options.familyId || "",
      familyName: options.familyName
        ? decodeURIComponent(options.familyName)
        : "当前家庭",
      cardId: options.cardId || "",
      draft: getDefaultDraft(type),
    });
    this.loadEditor();
  },

  getScope() {
    return {
      userId: this.data.userId,
      familyId: this.data.familyId,
    };
  },

  async loadEditor() {
    if (!this.data.userId || !this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "卡片信息已失效，请返回健康记录重试",
      });
      return;
    }

    try {
      const [bootstrap, dashboardData, templateResult] =
        await Promise.all([
          app.callFamilyApi("bootstrap"),
          app.callQueryApi("getDashboardData", {
            familyId: this.data.familyId,
          }),
          app.callTemplateApi("listTemplates", {
            familyId: this.data.familyId,
          }),
        ]);
      const family = (bootstrap.families || []).find(
        (candidate) => candidate.id === this.data.familyId,
      );

      if (!family || bootstrap.user?.id !== this.data.userId) {
        throw new Error("当前账号或家庭已经变化，请返回健康记录重试");
      }

      const storedCard = this.data.cardId
        ? dashboardCardStore
            .load(this.getScope())
            .find((card) => card.id === this.data.cardId)
        : null;

      if (this.data.cardId && !storedCard) {
        throw new Error("这张卡片已被删除");
      }

      this._dashboardData = dashboardData;
      const members = addDisplayLabels(dashboardData.members || []);
      const templates = templateResult.templates || [];
      const draft = storedCard || this.data.draft;
      const selectedMemberIds =
        draft.memberIds.length > 0
          ? draft.memberIds.filter((memberId) =>
              members.some((member) => member.id === memberId),
            )
          : members.map((member) => member.id);
      const memberChoices = members.map((member) => ({
        ...member,
        checked: selectedMemberIds.includes(member.id),
      }));
      const templateSelection = resolveTemplateSelection({
        cardType: draft.type,
        templates,
        templateId: draft.templateId,
      });
      const resolvedDraft = {
        ...draft,
        templateId: templateSelection.templateId,
      };

      this.setData({
        status: "ready",
        familyName: family.name,
        draft: resolvedDraft,
        members: memberChoices,
        selectedMemberIds,
        templates,
        templateOptions: templateSelection.options,
        templateIndex: templateSelection.index,
        timeRangeIndex: Math.max(
          0,
          TIME_RANGE_OPTIONS.findIndex(
            (option) => option.value === draft.timeRange,
          ),
        ),
        errorMessage: "",
      });
      this.refreshFieldsAndPreview(resolvedDraft.fieldKeys);
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载卡片设置",
      });
    }
  },

  onTypeChange(event) {
    const type = event.currentTarget.dataset.type;
    const typeOption = TYPE_OPTIONS.find(
      (option) => option.value === type,
    );

    if (!typeOption || type === this.data.draft.type) {
      return;
    }

    const templateSelection = resolveTemplateSelection({
      cardType: type,
      templates: this.data.templates,
      templateId: this.data.draft.templateId,
    });

    this.setData({
      "draft.type": type,
      "draft.title": typeOption.title,
      "draft.templateId": templateSelection.templateId,
      "draft.timeRange":
        type === "recurring_rules" ? "all" : "30d",
      templateOptions: templateSelection.options,
      templateIndex: templateSelection.index,
      timeRangeIndex: type === "recurring_rules" ? 3 : 1,
    });
    this.refreshFieldsAndPreview([]);
  },

  onTitleInput(event) {
    this.setData({
      "draft.title": event.detail.value,
      errorMessage: "",
    });
    this.refreshPreview();
  },

  onTemplateChange(event) {
    const templateIndex = Number(event.detail.value);
    const selected = this.data.templateOptions[templateIndex];

    this.setData({
      templateIndex,
      "draft.templateId": selected?.id || "",
      errorMessage: "",
    });
    this.refreshFieldsAndPreview([]);
  },

  onMembersChange(event) {
    const selectedMemberIds = event.detail.value;
    this.setData({
      selectedMemberIds,
      members: this.data.members.map((member) => ({
        ...member,
        checked: selectedMemberIds.includes(member.id),
      })),
      errorMessage: "",
    });
    this.refreshPreview();
  },

  onFieldsChange(event) {
    const selectedFieldKeys = event.detail.value;
    this.setData({
      selectedFieldKeys,
      fieldOptions: this.data.fieldOptions.map((field) => ({
        ...field,
        checked: selectedFieldKeys.includes(field.key),
      })),
      errorMessage: "",
    });
    this.refreshPreview();
  },

  onTimeRangeChange(event) {
    const timeRangeIndex = Number(event.detail.value);
    this.setData({
      timeRangeIndex,
      "draft.timeRange":
        TIME_RANGE_OPTIONS[timeRangeIndex]?.value || "30d",
    });
    this.refreshPreview();
  },

  refreshFieldsAndPreview(requestedFieldKeys) {
    const template = this.data.templateOptions[this.data.templateIndex];
    const fieldOptions = (template?.fields || []).filter(
      (field) =>
        this.data.draft.type !== "trend" || field.type === "number",
    );
    const selectedFieldKeys =
      requestedFieldKeys.length > 0
        ? requestedFieldKeys.filter((fieldKey) =>
            fieldOptions.some((field) => field.key === fieldKey),
          )
        : fieldOptions.map((field) => field.key);

    this.setData({
      fieldOptions: fieldOptions.map((field) => ({
        ...field,
        checked: selectedFieldKeys.includes(field.key),
      })),
      selectedFieldKeys,
    });
    this.refreshPreview();
  },

  getDraftForSave() {
    const allMemberIds = this.data.members.map((member) => member.id);
    const selectedMemberIds = this.data.selectedMemberIds;
    const includesAllMembers =
      selectedMemberIds.length === allMemberIds.length &&
      allMemberIds.every((memberId) =>
        selectedMemberIds.includes(memberId),
      );

    return {
      type: this.data.draft.type,
      title: this.data.draft.title.trim(),
      memberIds: includesAllMembers ? [] : selectedMemberIds,
      templateId: this.data.draft.templateId,
      timeRange: this.data.draft.timeRange,
      fieldKeys: this.data.selectedFieldKeys,
    };
  },

  refreshPreview() {
    if (!this._dashboardData || this.data.status !== "ready") {
      return;
    }

    const view = buildDashboardCardViews({
      cards: [
        {
          id: this.data.cardId || "preview",
          ...this.getDraftForSave(),
        },
      ],
      dashboardData: this._dashboardData,
      members: this.data.members,
    })[0];
    this.setData({
      preview: formatPreview(view),
    });
  },

  async onSave() {
    if (this.data.saving) {
      return;
    }

    const draft = this.getDraftForSave();

    if (!draft.title) {
      this.setData({ errorMessage: "请填写卡片名称" });
      return;
    }

    if (this.data.selectedMemberIds.length === 0) {
      this.setData({ errorMessage: "请至少选择一名成员" });
      return;
    }

    if (
      (draft.type === "trend" || draft.type === "latest_data") &&
      !draft.templateId
    ) {
      this.setData({ errorMessage: "这类卡片需要选择一个健康项目" });
      return;
    }

    if (draft.type === "trend" && draft.fieldKeys.length === 0) {
      this.setData({ errorMessage: "趋势卡片需要至少一个数值字段" });
      return;
    }

    if (
      (draft.type === "record_list" ||
        draft.type === "latest_data") &&
      this.data.fieldOptions.length > 0 &&
      draft.fieldKeys.length === 0
    ) {
      this.setData({ errorMessage: "请至少选择一个展示字段" });
      return;
    }

    this.setData({ saving: true, errorMessage: "" });

    try {
      if (this.data.mode === "edit") {
        dashboardCardStore.update(
          this.getScope(),
          this.data.cardId,
          draft,
        );
      } else {
        dashboardCardStore.add(this.getScope(), draft);
      }

      wx.showToast({
        title: "卡片已保存",
        icon: "success",
      });
      setTimeout(() => wx.navigateBack(), 450);
    } catch (error) {
      this.setData({
        saving: false,
        errorMessage: error.message || "保存失败，请稍后重试",
      });
    }
  },

  async onDelete() {
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "删除这张卡片？",
        content: "健康记录和提醒不会被删除。",
        confirmText: "删除",
        confirmColor: "#b34e49",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });

    if (!confirmed) {
      return;
    }

    dashboardCardStore.remove(this.getScope(), this.data.cardId);
    wx.showToast({ title: "卡片已删除", icon: "success" });
    setTimeout(() => wx.navigateBack(), 350);
  },

  onAddRecurringRule() {
    wx.navigateTo({
      url: `/pages/record-editor/record-editor?mode=recurring&familyId=${
        this.data.familyId
      }&familyName=${encodeURIComponent(
        this.data.familyName,
      )}&templateId=${this.data.draft.templateId}`,
    });
  },
});
