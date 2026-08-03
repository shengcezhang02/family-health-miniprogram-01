class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function cloneRepeat(repeat) {
  return {
    ...repeat,
    ...(Array.isArray(repeat.weekdays)
      ? { weekdays: [...repeat.weekdays] }
      : {}),
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toRecordSummary(record) {
  const summary = {
    id: record._id,
    familyId: record.familyId,
    subjectUserId: record.subjectUserId,
    sourceTemplateType: record.sourceTemplateType,
    sourceTemplateId: record.sourceTemplateId,
    templateNameSnapshot: record.templateNameSnapshot,
    fieldSchemaSnapshot: record.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...record.values },
    occurredAt: toIsoString(record.occurredAt),
    recordSource: record.recordSource,
    createdByUserId: record.createdByUserId,
    updatedByUserId: record.updatedByUserId,
    revision: record.revision,
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt),
    originRecordId: record.originRecordId,
  };

  if (record.remark) {
    summary.remark = record.remark;
  }

  if (record.sourceReminderId) {
    summary.sourceReminderId = record.sourceReminderId;
  }

  if (record.deletedAt) {
    summary.deletedAt = toIsoString(record.deletedAt);
    summary.deletedByUserId = record.deletedByUserId;
  }

  return summary;
}

function toReminderSummary(reminder) {
  const summary = {
    id: reminder._id,
    familyId: reminder.familyId,
    subjectUserId: reminder.subjectUserId,
    sourceTemplateType: reminder.sourceTemplateType,
    sourceTemplateId: reminder.sourceTemplateId,
    templateNameSnapshot: reminder.templateNameSnapshot,
    fieldSchemaSnapshot: reminder.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...reminder.values },
    plannedAt: toIsoString(reminder.plannedAt),
    notificationTimes: reminder.notificationTimes.map(toIsoString),
    status: reminder.status,
    creationSource: reminder.creationSource,
    createdByUserId: reminder.createdByUserId,
    updatedByUserId: reminder.updatedByUserId,
    revision: reminder.revision,
    createdAt: toIsoString(reminder.createdAt),
    updatedAt: toIsoString(reminder.updatedAt),
  };

  if (reminder.remark) {
    summary.remark = reminder.remark;
  }

  if (reminder.nextNotificationAt) {
    summary.nextNotificationAt = toIsoString(
      reminder.nextNotificationAt,
    );
  }

  if (reminder.completedAt) {
    summary.completedAt = toIsoString(reminder.completedAt);
    summary.linkedRecordId = reminder.linkedRecordId;
  }

  return summary;
}

function toRecurringRuleSummary(rule) {
  const summary = {
    id: rule._id,
    familyId: rule.familyId,
    subjectUserId: rule.subjectUserId,
    sourceTemplateType: rule.sourceTemplateType,
    sourceTemplateId: rule.sourceTemplateId,
    templateNameSnapshot: rule.templateNameSnapshot,
    fieldSchemaSnapshot: rule.fieldSchemaSnapshot.map((field) => ({
      ...field,
    })),
    values: { ...rule.values },
    startDate: rule.startDate,
    endDate: rule.endDate,
    repeat: cloneRepeat(rule.repeat),
    dailyTimes: [...rule.dailyTimes],
    status: rule.status,
    createdByUserId: rule.createdByUserId,
    updatedByUserId: rule.updatedByUserId,
    revision: rule.revision,
    createdAt: toIsoString(rule.createdAt),
    updatedAt: toIsoString(rule.updatedAt),
  };

  if (rule.remark) {
    summary.remark = rule.remark;
  }

  if (rule.pausedAt) {
    summary.pausedAt = toIsoString(rule.pausedAt);
    summary.pausedByUserId = rule.pausedByUserId;
    summary.pauseReason = rule.pauseReason;
  }

  if (rule.deletedAt) {
    summary.deletedAt = toIsoString(rule.deletedAt);
    summary.deletedByUserId = rule.deletedByUserId;
  }

  return summary;
}

function validateRecurringSchedule(data) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDate = (value) =>
    typeof value === "string" &&
    datePattern.test(value) &&
    !Number.isNaN(new Date(`${value}T00:00:00+08:00`).getTime());

  if (
    !isValidDate(data.startDate) ||
    !isValidDate(data.endDate) ||
    data.startDate > data.endDate
  ) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "请选择正确的开始和结束日期",
    );
  }

  let repeat;

  if (data.repeat?.type === "daily") {
    repeat = {
      type: "daily",
    };
  } else if (data.repeat?.type === "weekly") {
    const sourceWeekdays = Array.isArray(data.repeat.weekdays)
      ? data.repeat.weekdays
      : [];
    const weekdays = [
      ...new Set(
        sourceWeekdays.filter(
          (weekday) =>
            Number.isInteger(weekday) && weekday >= 1 && weekday <= 7,
        ),
      ),
    ].sort((left, right) => left - right);

    if (
      weekdays.length === 0 ||
      sourceWeekdays.some(
        (weekday) =>
          !Number.isInteger(weekday) || weekday < 1 || weekday > 7,
      )
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请选择正确的每周重复日期",
      );
    }

    repeat = {
      type: "weekly",
      weekdays,
    };
  } else if (data.repeat?.type === "interval_days") {
    if (
      !Number.isInteger(data.repeat.intervalDays) ||
      data.repeat.intervalDays < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "每隔天数必须是正整数",
      );
    }

    repeat = {
      type: "interval_days",
      intervalDays: data.repeat.intervalDays,
    };
  } else {
    throw new ApiError("INVALID_ARGUMENT", "重复方式不正确");
  }

  const sourceDailyTimes = Array.isArray(data.dailyTimes)
    ? data.dailyTimes
    : [];
  const invalidDailyTime = sourceDailyTimes.some(
    (value) =>
      typeof value !== "string" ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
  );
  const dailyTimes = [...new Set(sourceDailyTimes)].sort();

  if (dailyTimes.length === 0 || invalidDailyTime) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "请至少设置一个正确的每日时间",
    );
  }

  return {
    startDate: data.startDate,
    endDate: data.endDate,
    repeat,
    dailyTimes,
  };
}

function toActiveTemplate(template) {
  return {
    ...template,
    id: template.id ?? template._id,
    fields: template.fields
      .filter((field) => field.status !== "inactive")
      .map(({ status, options, ...field }) => ({
        ...field,
        ...(options
          ? {
              options: options
                .filter((option) => option.status !== "inactive")
                .map(({ status: optionStatus, ...option }) => ({
                  ...option,
                })),
            }
          : {}),
      })),
  };
}

function validateRecordInput(data, template) {
  if (
    typeof data.familyId !== "string" ||
    !data.familyId ||
    typeof data.subjectUserId !== "string" ||
    !data.subjectUserId ||
    typeof data.sourceTemplateId !== "string" ||
    !data.sourceTemplateId
  ) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "请选择家庭、记录对象和记录模板",
    );
  }

  const occurredAt = new Date(data.occurredAt);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new ApiError("INVALID_ARGUMENT", "请选择有效的记录时间");
  }

  if (
    !data.values ||
    typeof data.values !== "object" ||
    Array.isArray(data.values)
  ) {
    throw new ApiError("INVALID_ARGUMENT", "请填写记录内容");
  }

  const allowedKeys = new Set(template.fields.map((field) => field.key));
  const unknownKey = Object.keys(data.values).find(
    (key) => !allowedKeys.has(key),
  );

  if (unknownKey) {
    throw new ApiError("INVALID_ARGUMENT", "记录中包含模板以外的字段");
  }

  const values = {};

  for (const field of template.fields) {
    const rawValue = data.values[field.key];
    const isBlank =
      rawValue === undefined ||
      rawValue === null ||
      (typeof rawValue === "string" && rawValue.trim() === "");

    if (isBlank) {
      if (field.required) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          `请填写${field.label}`,
        );
      }
      continue;
    }

    if (field.type === "number") {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          `${field.label}必须是有效数字`,
        );
      }
      values[field.key] = rawValue;
      continue;
    }

    if (field.type === "short_text") {
      if (typeof rawValue !== "string" || rawValue.trim().length > 100) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          `${field.label}最多填写100个字`,
        );
      }
      values[field.key] = rawValue.trim();
      continue;
    }

    if (field.type === "single_choice") {
      const allowedOptions = new Set(
        (field.options ?? []).map((option) => option.key),
      );

      if (
        typeof rawValue !== "string" ||
        !allowedOptions.has(rawValue)
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          `${field.label}必须选择有效选项`,
        );
      }
      values[field.key] = rawValue;
      continue;
    }

    throw new ApiError("INVALID_ARGUMENT", "模板包含暂不支持的字段类型");
  }

  let remark;

  if (data.remark !== undefined && data.remark !== null) {
    if (typeof data.remark !== "string") {
      throw new ApiError("INVALID_ARGUMENT", "备注格式不正确");
    }
    remark = data.remark.trim();
    if (remark.length > 500) {
      throw new ApiError("INVALID_ARGUMENT", "备注最多填写500个字");
    }
  }

  return {
    occurredAt,
    values,
    ...(remark ? { remark } : {}),
  };
}

function appendTemporaryFields(data, template) {
  if (data.temporaryFields === undefined) {
    return {
      template,
      values: data.values,
    };
  }

  if (
    !Array.isArray(data.temporaryFields) ||
    data.temporaryFields.length > 3
  ) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "一条记录最多可以添加 3 个临时字段",
    );
  }

  const baseSortOrder = Math.max(
    0,
    ...template.fields.map((field) => field.sortOrder ?? 0),
  );
  const temporaryFields = data.temporaryFields.map((field, index) => {
    const label =
      typeof field.label === "string" ? field.label.trim() : "";

    if (!label || label.length > 30) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请填写 1 至 30 个字的临时字段名称",
      );
    }

    if (
      field.value !== undefined &&
      (typeof field.value !== "string" ||
        field.value.trim().length > 100)
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        `${label}最多填写100个字`,
      );
    }

    return {
      key: `temporary-${index + 1}`,
      label,
      type: "short_text",
      required: false,
      temporary: true,
      sortOrder: baseSortOrder + (index + 1) * 10,
    };
  });
  const fieldKeys = new Set(template.fields.map((field) => field.key));

  if (temporaryFields.some((field) => fieldKeys.has(field.key))) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "模板字段与临时字段编号冲突",
    );
  }

  return {
    template: {
      ...template,
      fields: [...template.fields, ...temporaryFields],
    },
    values: {
      ...data.values,
      ...Object.fromEntries(
        temporaryFields.map((field, index) => [
          field.key,
          data.temporaryFields[index].value,
        ]),
      ),
    },
  };
}

function createHealthItemApi({
  getCaller,
  healthItemStore,
  getSystemTemplate,
  createRecordId,
  createReminderId,
  createRuleId,
  createCheckInRecordId,
  hashCareShareToken,
  now,
  reportError = () => {},
} = {}) {
  async function changeDeletionState(data, shouldRestore) {
    if (
      typeof data.recordId !== "string" ||
      !data.recordId ||
      !Number.isInteger(data.expectedRevision) ||
      data.expectedRevision < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请提供记录和当前版本",
      );
    }

    const [caller, record] = await Promise.all([
      getCaller(),
      healthItemStore.getRecordById(data.recordId),
    ]);

    if (
      !record ||
      (shouldRestore ? !record.deletedAt : Boolean(record.deletedAt))
    ) {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        shouldRestore ? "没有找到可恢复的记录" : "这条记录不存在或已删除",
      );
    }

    const membership = await healthItemStore.getActiveMembership(
      record.familyId,
      caller._id,
    );

    if (!membership) {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        shouldRestore
          ? "只有当前家庭的有效成员可以恢复记录"
          : "只有当前家庭的有效成员可以删除记录",
      );
    }

    const result = shouldRestore
      ? await healthItemStore.restoreRecord({
          recordId: record._id,
          familyId: record.familyId,
          expectedRevision: data.expectedRevision,
          updatedByUserId: caller._id,
          updatedAt: now(),
        })
      : await healthItemStore.softDeleteRecord({
          recordId: record._id,
          familyId: record.familyId,
          expectedRevision: data.expectedRevision,
          updatedByUserId: caller._id,
          updatedAt: now(),
        });

    if (result.outcome === "permission-denied") {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以更改记录",
      );
    }

    if (result.outcome === "not-found") {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        shouldRestore ? "没有找到可恢复的记录" : "这条记录不存在或已删除",
      );
    }

    if (result.outcome === "revision-conflict") {
      throw new ApiError(
        "REVISION_CONFLICT",
        "记录已被其他人修改，请刷新后重试",
      );
    }

    if (result.outcome === "reminder-conflict") {
      throw new ApiError(
        "REMINDER_LINK_CONFLICT",
        "原提醒已经关联新的打卡记录，请先处理新记录",
      );
    }

    return {
      record: toRecordSummary(result.record),
    };
  }

  async function changeRecurringRuleDeletionState(
    data,
    shouldRestore,
  ) {
    if (
      typeof data.ruleId !== "string" ||
      !data.ruleId ||
      !Number.isInteger(data.expectedRevision) ||
      data.expectedRevision < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请提供周期规则和当前版本",
      );
    }

    const [caller, rule] = await Promise.all([
      getCaller(),
      healthItemStore.getRecurringRuleById(data.ruleId),
    ]);

    if (
      !rule ||
      (shouldRestore ? !rule.deletedAt : Boolean(rule.deletedAt))
    ) {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        shouldRestore
          ? "没有找到可恢复的周期规则"
          : "这个周期规则不存在或已删除",
      );
    }

    const membership = await healthItemStore.getActiveMembership(
      rule.familyId,
      caller._id,
    );

    if (!membership) {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以更改周期规则",
      );
    }

    const result =
      await healthItemStore.changeRecurringRuleDeletionState({
        ruleId: rule._id,
        familyId: rule.familyId,
        expectedRevision: data.expectedRevision,
        updatedByUserId: caller._id,
        updatedAt: now(),
        shouldRestore,
      });

    if (result.outcome === "not-found") {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        shouldRestore
          ? "没有找到可恢复的周期规则"
          : "这个周期规则不存在或已删除",
      );
    }

    if (result.outcome === "permission-denied") {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以修改周期规则",
      );
    }

    if (result.outcome === "revision-conflict") {
      throw new ApiError(
        "REVISION_CONFLICT",
        "周期规则已被其他人修改，请刷新后重试",
      );
    }

    return {
      rule: toRecurringRuleSummary(result.rule),
      needsReconciliation: true,
    };
  }

  async function updateReminder(data) {
    if (
      typeof data.reminderId !== "string" ||
      !data.reminderId ||
      !Number.isInteger(data.expectedRevision) ||
      data.expectedRevision < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请提供提醒和当前版本",
      );
    }

    const lockedFields = [
      "familyId",
      "subjectUserId",
      "sourceTemplateType",
      "sourceTemplateId",
      "templateNameSnapshot",
      "fieldSchemaSnapshot",
      "status",
    ];
    if (lockedFields.some((field) => Object.hasOwn(data, field))) {
      throw new ApiError(
        "LOCKED_FIELDS_CANNOT_CHANGE",
        "提醒保存后不能更换所属人、模板、表单结构或完成状态",
      );
    }

    const [caller, reminder] = await Promise.all([
      getCaller(),
      healthItemStore.getReminderById(data.reminderId),
    ]);

    if (!reminder || reminder.deletedAt) {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个提醒不存在或已删除",
      );
    }

    const membership = await healthItemStore.getActiveMembership(
      reminder.familyId,
      caller._id,
    );

    if (!membership) {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以修改提醒",
      );
    }

    if (reminder.status !== "pending") {
      throw new ApiError(
        "REMINDER_ALREADY_COMPLETED",
        "已打卡提醒不能修改，请编辑关联记录",
      );
    }

    const input = validateRecordInput(
      {
        ...data,
        familyId: reminder.familyId,
        subjectUserId: reminder.subjectUserId,
        sourceTemplateId: reminder.sourceTemplateId,
        occurredAt: data.plannedAt,
      },
      {
        fields: reminder.fieldSchemaSnapshot.map((field) => ({
          ...field,
          required: false,
        })),
      },
    );
    const notificationTimes = Array.isArray(data.notificationTimes)
      ? data.notificationTimes.map((value) => new Date(value))
      : [];

    if (
      notificationTimes.some((value) =>
        Number.isNaN(value.getTime()),
      )
    ) {
      throw new ApiError("INVALID_ARGUMENT", "通知时间不正确");
    }

    notificationTimes.sort(
      (left, right) => left.getTime() - right.getTime(),
    );
    const result = await healthItemStore.updateReminder({
      reminderId: reminder._id,
      familyId: reminder.familyId,
      expectedRevision: data.expectedRevision,
      values: input.values,
      remark: input.remark,
      plannedAt: input.occurredAt,
      notificationTimes,
      updatedByUserId: caller._id,
      updatedAt: now(),
    });

    if (result.outcome === "not-found") {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个提醒不存在或已删除",
      );
    }

    if (result.outcome === "already-completed") {
      throw new ApiError(
        "REMINDER_ALREADY_COMPLETED",
        "已打卡提醒不能修改，请编辑关联记录",
      );
    }

    if (result.outcome === "revision-conflict") {
      throw new ApiError(
        "REVISION_CONFLICT",
        "提醒已被其他人修改，请刷新后重试",
      );
    }

    return {
      reminder: toReminderSummary(result.reminder),
    };
  }

  async function updateRecurringRule(data) {
    if (
      typeof data.ruleId !== "string" ||
      !data.ruleId ||
      !Number.isInteger(data.expectedRevision) ||
      data.expectedRevision < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请提供周期规则和当前版本",
      );
    }

    const lockedFields = [
      "familyId",
      "subjectUserId",
      "sourceTemplateType",
      "sourceTemplateId",
      "templateNameSnapshot",
      "fieldSchemaSnapshot",
      "status",
    ];

    if (lockedFields.some((field) => Object.hasOwn(data, field))) {
      throw new ApiError(
        "LOCKED_FIELDS_CANNOT_CHANGE",
        "周期规则保存后不能更换所属人、模板、表单结构或状态",
      );
    }

    const [caller, rule] = await Promise.all([
      getCaller(),
      healthItemStore.getRecurringRuleById(data.ruleId),
    ]);

    if (!rule || rule.deletedAt) {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个周期规则不存在或已删除",
      );
    }

    const membership = await healthItemStore.getActiveMembership(
      rule.familyId,
      caller._id,
    );

    if (!membership) {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以修改周期规则",
      );
    }

    const schedule = validateRecurringSchedule(data);
    const input = validateRecordInput(
      {
        ...data,
        familyId: rule.familyId,
        subjectUserId: rule.subjectUserId,
        sourceTemplateId: rule.sourceTemplateId,
        occurredAt: `${schedule.startDate}T00:00:00+08:00`,
      },
      {
        fields: rule.fieldSchemaSnapshot.map((field) => ({
          ...field,
          required: false,
        })),
      },
    );
    const result = await healthItemStore.updateRecurringRule({
      ruleId: rule._id,
      familyId: rule.familyId,
      expectedRevision: data.expectedRevision,
      values: input.values,
      remark: input.remark,
      ...schedule,
      updatedByUserId: caller._id,
      updatedAt: now(),
    });

    if (result.outcome === "not-found") {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个周期规则不存在或已删除",
      );
    }

    if (result.outcome === "permission-denied") {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以修改周期规则",
      );
    }

    if (result.outcome === "revision-conflict") {
      throw new ApiError(
        "REVISION_CONFLICT",
        "周期规则已被其他人修改，请刷新后重试",
      );
    }

    return {
      rule: toRecurringRuleSummary(result.rule),
      needsReconciliation: true,
    };
  }

  async function changeRuleStatus(data, nextStatus) {
    if (
      typeof data.ruleId !== "string" ||
      !data.ruleId ||
      !Number.isInteger(data.expectedRevision) ||
      data.expectedRevision < 1
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请提供周期规则和当前版本",
      );
    }

    const [caller, rule] = await Promise.all([
      getCaller(),
      healthItemStore.getRecurringRuleById(data.ruleId),
    ]);

    if (!rule || rule.deletedAt) {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个周期规则不存在或已删除",
      );
    }

    const [callerMembership, subjectMembership] = await Promise.all([
      healthItemStore.getActiveMembership(rule.familyId, caller._id),
      healthItemStore.getActiveMembership(
        rule.familyId,
        rule.subjectUserId,
      ),
    ]);

    if (!callerMembership) {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以更改周期规则",
      );
    }

    if (nextStatus === "active" && !subjectMembership) {
      throw new ApiError(
        "SUBJECT_INACTIVE",
        "数据所属人已不在家庭中，不能恢复周期规则",
      );
    }

    const result = await healthItemStore.setRecurringRuleStatus({
      ruleId: rule._id,
      familyId: rule.familyId,
      expectedRevision: data.expectedRevision,
      expectedStatus: nextStatus === "active" ? "paused" : "active",
      nextStatus,
      updatedByUserId: caller._id,
      updatedAt: now(),
    });

    if (result.outcome === "not-found") {
      throw new ApiError(
        "HEALTH_ITEM_NOT_FOUND",
        "这个周期规则不存在或已删除",
      );
    }

    if (result.outcome === "permission-denied") {
      throw new ApiError(
        "HEALTH_ITEM_ACCESS_DENIED",
        "只有当前家庭的有效成员可以更改周期规则",
      );
    }

    if (result.outcome === "subject-inactive") {
      throw new ApiError(
        "SUBJECT_INACTIVE",
        "数据所属人已不在家庭中，不能恢复周期规则",
      );
    }

    if (result.outcome === "invalid-state") {
      throw new ApiError(
        "RULE_STATE_CONFLICT",
        nextStatus === "active"
          ? "这个周期规则当前没有暂停"
          : "这个周期规则已经暂停",
      );
    }

    if (result.outcome === "revision-conflict") {
      throw new ApiError(
        "REVISION_CONFLICT",
        "周期规则已被其他人修改，请刷新后重试",
      );
    }

    return {
      rule: toRecurringRuleSummary(result.rule),
      needsReconciliation: true,
    };
  }

  const actions = {
    async createRecurringRule(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim()
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "缺少本次保存的请求编号，请重试",
        );
      }

      const sourceTemplateType =
        data.sourceTemplateType === undefined
          ? "system"
          : data.sourceTemplateType;

      if (
        sourceTemplateType !== "system" &&
        sourceTemplateType !== "custom"
      ) {
        throw new ApiError("INVALID_ARGUMENT", "模板类型不正确");
      }

      const schedule = validateRecurringSchedule(data);

      const caller = await getCaller();
      const [callerMembership, subjectMembership] = await Promise.all([
        healthItemStore.getActiveMembership(data.familyId, caller._id),
        healthItemStore.getActiveMembership(
          data.familyId,
          data.subjectUserId,
        ),
      ]);

      if (!callerMembership || !subjectMembership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只能为当前家庭的有效成员创建周期规则",
        );
      }

      const sourceTemplate =
        sourceTemplateType === "system"
          ? getSystemTemplate(data.sourceTemplateId)
          : await healthItemStore.getCustomTemplate(
              data.familyId,
              data.sourceTemplateId,
            );

      if (!sourceTemplate || sourceTemplate.status === "inactive") {
        throw new ApiError(
          "TEMPLATE_NOT_FOUND",
          "这个模板不存在或已停用",
        );
      }

      const activeTemplate = toActiveTemplate(sourceTemplate);
      const prepared = appendTemporaryFields(data, activeTemplate);
      const template = prepared.template;
      const input = validateRecordInput(
        {
          ...data,
          occurredAt: `${data.startDate}T00:00:00+08:00`,
          values: prepared.values,
        },
        {
          ...template,
          fields: template.fields.map((field) => ({
            ...field,
            required: false,
          })),
        },
      );
      const ruleId = createRuleId({
        callerUserId: caller._id,
        requestId: request.requestId,
      });
      const timestamp = now();
      const result = await healthItemStore.createRecurringRule({
        _id: ruleId,
        familyId: data.familyId,
        subjectUserId: data.subjectUserId,
        sourceTemplateType,
        sourceTemplateId: template.id,
        templateNameSnapshot: template.name,
        fieldSchemaSnapshot: template.fields.map((field) => ({
          ...field,
        })),
        values: input.values,
        ...(input.remark ? { remark: input.remark } : {}),
        ...schedule,
        status: "active",
        createdByUserId: caller._id,
        updatedByUserId: caller._id,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return {
        rule: toRecurringRuleSummary(result.rule),
        replayed: result.outcome === "replayed",
      };
    },

    async pauseRule(data) {
      return changeRuleStatus(data, "paused");
    },

    async resumeRule(data) {
      return changeRuleStatus(data, "active");
    },

    async checkInReminder(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim() ||
        typeof data.reminderId !== "string" ||
        !data.reminderId ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请提供提醒、当前版本和请求编号",
        );
      }

      const [caller, reminder] = await Promise.all([
        getCaller(),
        healthItemStore.getReminderById(data.reminderId),
      ]);

      if (!reminder || reminder.deletedAt) {
        throw new ApiError(
          "HEALTH_ITEM_NOT_FOUND",
          "这个提醒不存在或已删除",
        );
      }

      const [callerMembership, subjectMembership] = await Promise.all([
        healthItemStore.getActiveMembership(
          reminder.familyId,
          caller._id,
        ),
        healthItemStore.getActiveMembership(
          reminder.familyId,
          reminder.subjectUserId,
        ),
      ]);

      if (!callerMembership || !subjectMembership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只有当前家庭的有效成员可以完成提醒",
        );
      }

      const input = validateRecordInput(
        {
          ...data,
          familyId: reminder.familyId,
          subjectUserId: reminder.subjectUserId,
          sourceTemplateId: reminder.sourceTemplateId,
          values: {
            ...reminder.values,
            ...(data.values ?? {}),
          },
        },
        {
          fields: reminder.fieldSchemaSnapshot,
        },
      );
      const recordId = createCheckInRecordId({
        reminderId: reminder._id,
      });
      const timestamp = now();
      const result = await healthItemStore.checkInReminder({
        reminderId: reminder._id,
        familyId: reminder.familyId,
        expectedRevision: data.expectedRevision,
        record: {
          _id: recordId,
          familyId: reminder.familyId,
          subjectUserId: reminder.subjectUserId,
          sourceTemplateType: reminder.sourceTemplateType,
          sourceTemplateId: reminder.sourceTemplateId,
          templateNameSnapshot: reminder.templateNameSnapshot,
          fieldSchemaSnapshot: reminder.fieldSchemaSnapshot.map(
            (field) => ({
              ...field,
            }),
          ),
          values: input.values,
          ...(input.remark ? { remark: input.remark } : {}),
          occurredAt: input.occurredAt,
          recordSource: "reminder_check_in",
          sourceReminderId: reminder._id,
          createdByUserId: caller._id,
          updatedByUserId: caller._id,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          originRecordId: recordId,
        },
        updatedByUserId: caller._id,
        completedAt: timestamp,
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只有当前家庭的有效成员可以完成提醒",
        );
      }

      if (result.outcome === "not-found") {
        throw new ApiError(
          "HEALTH_ITEM_NOT_FOUND",
          "这个提醒不存在或已删除",
        );
      }

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "提醒已被其他人修改，请刷新后重试",
        );
      }

      return {
        reminder: toReminderSummary(result.reminder),
        record: toRecordSummary(result.record),
        replayed: result.outcome === "replayed",
      };
    },

    async submitCareShare(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim() ||
        typeof data.token !== "string" ||
        !data.token ||
        typeof hashCareShareToken !== "function"
      ) {
        throw new ApiError(
          "CARE_SHARE_INVALID",
          "这份关心分享无效",
        );
      }

      const [caller, share] = await Promise.all([
        getCaller(),
        healthItemStore.getCareShareByTokenHash(
          hashCareShareToken(data.token),
        ),
      ]);

      if (!caller) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "用户信息尚未初始化，请重新进入小程序",
        );
      }

      if (!share) {
        throw new ApiError(
          "CARE_SHARE_INVALID",
          "这份关心分享无效",
        );
      }

      if (share.expiresAt.getTime() <= now().getTime()) {
        throw new ApiError(
          "CARE_SHARE_EXPIRED",
          "这份关心分享已经过期",
        );
      }

      const reminder = await healthItemStore.getReminderById(
        share.reminderId,
      );

      if (!reminder || reminder.deletedAt) {
        throw new ApiError(
          "CARE_SHARE_CANCELED",
          "该提醒已取消",
        );
      }

      if (reminder.status === "completed") {
        throw new ApiError(
          "CARE_SHARE_COMPLETED",
          "该提醒已经完成",
        );
      }

      const [callerMembership, subjectMembership] = await Promise.all([
        healthItemStore.getActiveMembership(share.familyId, caller._id),
        healthItemStore.getActiveMembership(
          share.familyId,
          share.subjectUserId,
        ),
      ]);

      if (!subjectMembership) {
        throw new ApiError(
          "CARE_SHARE_PAUSED",
          "档案所属人已不在当前家庭，暂时不能填写",
        );
      }

      if (!callerMembership) {
        throw new ApiError(
          "CARE_SHARE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以填写",
        );
      }

      const result = await actions.checkInReminder(
        {
          ...data,
          token: undefined,
          reminderId: reminder._id,
          expectedRevision: reminder.revision,
        },
        request,
      );

      return {
        ...result,
        shareStatus: "completed",
      };
    },

    async createReminder(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim()
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "缺少本次保存的请求编号，请重试",
        );
      }

      const sourceTemplateType =
        data.sourceTemplateType === undefined
          ? "system"
          : data.sourceTemplateType;

      if (
        sourceTemplateType !== "system" &&
        sourceTemplateType !== "custom"
      ) {
        throw new ApiError("INVALID_ARGUMENT", "模板类型不正确");
      }

      const caller = await getCaller();
      const [callerMembership, subjectMembership] = await Promise.all([
        healthItemStore.getActiveMembership(data.familyId, caller._id),
        healthItemStore.getActiveMembership(
          data.familyId,
          data.subjectUserId,
        ),
      ]);

      if (!callerMembership || !subjectMembership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只能为当前家庭的有效成员创建提醒",
        );
      }

      const sourceTemplate =
        sourceTemplateType === "system"
          ? getSystemTemplate(data.sourceTemplateId)
          : await healthItemStore.getCustomTemplate(
              data.familyId,
              data.sourceTemplateId,
            );

      if (!sourceTemplate || sourceTemplate.status === "inactive") {
        throw new ApiError(
          "TEMPLATE_NOT_FOUND",
          "这个模板不存在或已停用",
        );
      }

      const activeTemplate = toActiveTemplate(sourceTemplate);
      const prepared = appendTemporaryFields(data, activeTemplate);
      const template = prepared.template;
      const input = validateRecordInput(
        {
          ...data,
          occurredAt: data.plannedAt,
          values: prepared.values,
        },
        {
          ...template,
          fields: template.fields.map((field) => ({
            ...field,
            required: false,
          })),
        },
      );
      const notificationTimes = Array.isArray(data.notificationTimes)
        ? data.notificationTimes.map((value) => new Date(value))
        : [];

      if (
        notificationTimes.some((value) =>
          Number.isNaN(value.getTime()),
        )
      ) {
        throw new ApiError("INVALID_ARGUMENT", "通知时间不正确");
      }

      notificationTimes.sort(
        (left, right) => left.getTime() - right.getTime(),
      );
      const reminderId = createReminderId({
        callerUserId: caller._id,
        requestId: request.requestId,
      });
      const timestamp = now();
      const result = await healthItemStore.createReminder({
        _id: reminderId,
        familyId: data.familyId,
        subjectUserId: data.subjectUserId,
        sourceTemplateType,
        sourceTemplateId: template.id,
        templateNameSnapshot: template.name,
        fieldSchemaSnapshot: template.fields.map((field) => ({
          ...field,
        })),
        values: input.values,
        ...(input.remark ? { remark: input.remark } : {}),
        plannedAt: input.occurredAt,
        notificationTimes,
        ...(notificationTimes[0]
          ? { nextNotificationAt: notificationTimes[0] }
          : {}),
        notificationAttemptCount: 0,
        status: "pending",
        creationSource: "manual",
        dedupKey: `item:${reminderId}`,
        createdByUserId: caller._id,
        updatedByUserId: caller._id,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return {
        reminder: toReminderSummary(result.reminder),
        replayed: result.outcome === "replayed",
      };
    },

    async createRecord(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim()
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "缺少本次保存的请求编号，请重试",
        );
      }

      const sourceTemplateType =
        data.sourceTemplateType === undefined
          ? "system"
          : data.sourceTemplateType;

      if (
        sourceTemplateType !== "system" &&
        sourceTemplateType !== "custom"
      ) {
        throw new ApiError("INVALID_ARGUMENT", "模板类型不正确");
      }

      const caller = await getCaller();
      const [callerMembership, subjectMembership] = await Promise.all([
        healthItemStore.getActiveMembership(data.familyId, caller._id),
        healthItemStore.getActiveMembership(
          data.familyId,
          data.subjectUserId,
        ),
      ]);

      if (!callerMembership || !subjectMembership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只能为当前家庭的有效成员创建记录",
        );
      }

      const sourceTemplate =
        sourceTemplateType === "system"
          ? getSystemTemplate(data.sourceTemplateId)
          : await healthItemStore.getCustomTemplate(
              data.familyId,
              data.sourceTemplateId,
            );

      if (!sourceTemplate || sourceTemplate.status === "inactive") {
        throw new ApiError(
          "TEMPLATE_NOT_FOUND",
          "这个模板不存在或已停用",
        );
      }

      const activeTemplate = toActiveTemplate(sourceTemplate);
      const prepared = appendTemporaryFields(data, activeTemplate);
      const template = prepared.template;
      const input = validateRecordInput(
        {
          ...data,
          values: prepared.values,
        },
        template,
      );
      const recordId = createRecordId({
        callerUserId: caller._id,
        requestId: request.requestId,
      });
      const timestamp = now();
      const result = await healthItemStore.createRecord({
        _id: recordId,
        familyId: data.familyId,
        subjectUserId: data.subjectUserId,
        sourceTemplateType,
        sourceTemplateId: template.id,
        templateNameSnapshot: template.name,
        fieldSchemaSnapshot: template.fields.map((field) => ({
          ...field,
        })),
        values: input.values,
        ...(input.remark ? { remark: input.remark } : {}),
        occurredAt: input.occurredAt,
        recordSource: "manual",
        createdByUserId: caller._id,
        updatedByUserId: caller._id,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        originRecordId: recordId,
      });

      return {
        record: toRecordSummary(result.record),
        replayed: result.outcome === "replayed",
      };
    },

    async getHealthItem(data) {
      if (typeof data.ruleId === "string" && data.ruleId) {
        const [caller, rule] = await Promise.all([
          getCaller(),
          healthItemStore.getRecurringRuleById(data.ruleId),
        ]);

        if (!rule || rule.deletedAt) {
          throw new ApiError(
            "HEALTH_ITEM_NOT_FOUND",
            "这个周期规则不存在或已删除",
          );
        }

        const membership = await healthItemStore.getActiveMembership(
          rule.familyId,
          caller._id,
        );

        if (!membership) {
          throw new ApiError(
            "HEALTH_ITEM_ACCESS_DENIED",
            "只有当前家庭的有效成员可以查看周期规则",
          );
        }

        return {
          rule: toRecurringRuleSummary(rule),
        };
      }

      if (typeof data.reminderId === "string" && data.reminderId) {
        const [caller, reminder] = await Promise.all([
          getCaller(),
          healthItemStore.getReminderById(data.reminderId),
        ]);

        if (!reminder || reminder.deletedAt) {
          throw new ApiError(
            "HEALTH_ITEM_NOT_FOUND",
            "这个提醒不存在或已删除",
          );
        }

        const membership = await healthItemStore.getActiveMembership(
          reminder.familyId,
          caller._id,
        );

        if (!membership) {
          throw new ApiError(
            "HEALTH_ITEM_ACCESS_DENIED",
            "只有当前家庭的有效成员可以查看提醒",
          );
        }

        return {
          reminder: toReminderSummary(reminder),
        };
      }

      if (typeof data.recordId !== "string" || !data.recordId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择要查看的记录");
      }

      const [caller, record] = await Promise.all([
        getCaller(),
        healthItemStore.getRecordById(data.recordId),
      ]);

      if (!record || record.deletedAt) {
        throw new ApiError("HEALTH_ITEM_NOT_FOUND", "这条记录不存在");
      }

      const membership = await healthItemStore.getActiveMembership(
        record.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只有当前家庭的有效成员可以查看记录",
        );
      }

      return {
        record: toRecordSummary(record),
      };
    },

    async updateHealthItem(data) {
      if (data.ruleId) {
        return updateRecurringRule(data);
      }

      if (data.reminderId) {
        return updateReminder(data);
      }

      if (
        typeof data.recordId !== "string" ||
        !data.recordId ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请提供记录和当前版本",
        );
      }

      const lockedFields = [
        "familyId",
        "subjectUserId",
        "sourceTemplateType",
        "sourceTemplateId",
        "templateNameSnapshot",
        "fieldSchemaSnapshot",
        "recordSource",
      ];
      if (lockedFields.some((field) => Object.hasOwn(data, field))) {
        throw new ApiError(
          "LOCKED_FIELDS_CANNOT_CHANGE",
          "记录保存后不能更换所属人、模板或表单结构",
        );
      }

      const [caller, record] = await Promise.all([
        getCaller(),
        healthItemStore.getRecordById(data.recordId),
      ]);

      if (!record || record.deletedAt) {
        throw new ApiError(
          "HEALTH_ITEM_NOT_FOUND",
          "这条记录不存在或已删除",
        );
      }

      const membership = await healthItemStore.getActiveMembership(
        record.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只有当前家庭的有效成员可以修改记录",
        );
      }

      const input = validateRecordInput(
        {
          ...data,
          familyId: record.familyId,
          subjectUserId: record.subjectUserId,
          sourceTemplateId: record.sourceTemplateId,
        },
        {
          fields: record.fieldSchemaSnapshot,
        },
      );
      const result = await healthItemStore.updateRecord({
        recordId: record._id,
        familyId: record.familyId,
        expectedRevision: data.expectedRevision,
        values: input.values,
        remark: input.remark,
        occurredAt: input.occurredAt,
        updatedByUserId: caller._id,
        updatedAt: now(),
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "HEALTH_ITEM_ACCESS_DENIED",
          "只有当前家庭的有效成员可以修改记录",
        );
      }

      if (result.outcome === "not-found") {
        throw new ApiError(
          "HEALTH_ITEM_NOT_FOUND",
          "这条记录不存在或已删除",
        );
      }

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "记录已被其他人修改，请刷新后重试",
        );
      }

      return {
        record: toRecordSummary(result.record),
      };
    },

    async softDeleteItem(data) {
      if (data.ruleId) {
        return changeRecurringRuleDeletionState(data, false);
      }

      return changeDeletionState(data, false);
    },

    async restoreItem(data) {
      if (data.ruleId) {
        return changeRecurringRuleDeletionState(data, true);
      }

      return changeDeletionState(data, true);
    },
  };

  return {
    async handle(request = {}) {
      const action = actions[request.action];

      if (!action) {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "UNSUPPORTED_ACTION",
            message: "暂不支持这个操作",
          },
        };
      }

      try {
        return {
          ok: true,
          requestId: request.requestId,
          data: await action(request.data ?? {}, request),
        };
      } catch (error) {
        if (error instanceof ApiError) {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: error.code,
              message: error.message,
            },
          };
        }

        reportError(error);

        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "INTERNAL_ERROR",
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }
    },
  };
}

module.exports = {
  createHealthItemApi,
};
