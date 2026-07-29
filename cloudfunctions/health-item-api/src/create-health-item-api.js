class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
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

  if (record.deletedAt) {
    summary.deletedAt = toIsoString(record.deletedAt);
    summary.deletedByUserId = record.deletedByUserId;
  }

  return summary;
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

    return {
      record: toRecordSummary(result.record),
    };
  }

  const actions = {
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
      return changeDeletionState(data, false);
    },

    async restoreItem(data) {
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
