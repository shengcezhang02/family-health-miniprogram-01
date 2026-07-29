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

  return summary;
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

function createHealthItemApi({
  getCaller,
  healthItemStore,
  getSystemTemplate,
  createRecordId,
  now,
  reportError = () => {},
} = {}) {
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

      const template = getSystemTemplate(data.sourceTemplateId);

      if (!template) {
        throw new ApiError(
          "TEMPLATE_NOT_FOUND",
          "这个系统模板不存在或已停用",
        );
      }

      const input = validateRecordInput(data, template);
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

      const recordId = createRecordId({
        callerUserId: caller._id,
        requestId: request.requestId,
      });
      const timestamp = now();
      const result = await healthItemStore.createRecord({
        _id: recordId,
        familyId: data.familyId,
        subjectUserId: data.subjectUserId,
        sourceTemplateType: "system",
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
