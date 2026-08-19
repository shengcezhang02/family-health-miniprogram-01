const { listSystemTemplates } = require("./system-templates");

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const CUSTOM_FIELD_TYPES = new Set([
  "number",
  "short_text",
  "single_choice",
]);

const CUSTOM_TEMPLATE_COLORS = new Set([
  "rose",
  "blue",
  "green",
  "amber",
  "purple",
  "teal",
]);

function normalizeTemplateColor(colorKey, colorHex) {
  if (colorKey === undefined || colorKey === "") {
    return { colorKey: "purple" };
  }

  if (colorKey === "custom") {
    const normalizedHex =
      typeof colorHex === "string" ? colorHex.trim().toUpperCase() : "";
    if (!/^#[0-9A-F]{6}$/.test(normalizedHex)) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "颜色代码应为 # 加 6 位十六进制字符",
      );
    }
    return {
      colorKey: "custom",
      colorHex: normalizedHex,
    };
  }

  if (!CUSTOM_TEMPLATE_COLORS.has(colorKey)) {
    throw new ApiError("INVALID_ARGUMENT", "请选择有效的模板颜色");
  }

  return { colorKey };
}

function validateChoiceOptions(
  options,
  createId,
  idContext,
  fieldIndex,
  allowExistingKeys,
) {
  if (!Array.isArray(options) || options.length < 2 || options.length > 10) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "单选字段需要包含 2 至 10 个选项",
    );
  }

  const normalized = options.map((option, optionIndex) => {
    const label =
      typeof option.label === "string" ? option.label.trim() : "";

    if (!label || label.length > 30) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请填写 1 至 30 个字的选项名称",
      );
    }

    return {
      key:
        allowExistingKeys &&
        typeof option.key === "string" &&
        option.key.trim()
          ? option.key.trim()
          : createId(
              `option-${fieldIndex}-${optionIndex}`,
              idContext,
            ),
      label,
      status:
        allowExistingKeys && option.status === "inactive"
          ? "inactive"
          : "active",
      sortOrder:
        allowExistingKeys &&
        Number.isFinite(option.sortOrder) &&
        option.sortOrder > 0
          ? option.sortOrder
          : (optionIndex + 1) * 10,
    };
  });

  if (
    new Set(normalized.map((option) => option.key)).size !==
    normalized.length
  ) {
    throw new ApiError("INVALID_ARGUMENT", "单选项编号不能重复");
  }

  if (!normalized.some((option) => option.status === "active")) {
    throw new ApiError("INVALID_ARGUMENT", "单选字段至少需要一个启用选项");
  }

  return normalized;
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function toTemplateSummary(template) {
  return {
    id: template._id,
    familyId: template.familyId,
    sourceType: "custom",
    name: template.name,
    colorKey: template.colorKey || "purple",
    ...(template.colorKey === "custom" && template.colorHex
      ? { colorHex: template.colorHex }
      : {}),
    status: template.status,
    fields: template.fields.map((field) => ({
      ...field,
      ...(field.options
        ? {
            options: field.options.map((option) => ({
              ...option,
            })),
          }
        : {}),
    })),
    revision: template.revision,
    createdByUserId: template.createdByUserId,
    updatedByUserId: template.updatedByUserId,
    createdAt: toIsoString(template.createdAt),
    updatedAt: toIsoString(template.updatedAt),
  };
}

function validateCreateFields(fields, createId, idContext) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 10) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "自定义模板需要包含 1 至 10 个字段",
    );
  }

  return fields.map((field, index) => {
    const label =
      typeof field.label === "string" ? field.label.trim() : "";

    if (
      !label ||
      label.length > 30 ||
      !CUSTOM_FIELD_TYPES.has(field.type)
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请完整填写有效的字段名称和类型",
      );
    }

    if (
      field.unit !== undefined &&
      (field.type !== "number" ||
        typeof field.unit !== "string" ||
        field.unit.trim().length > 20)
    ) {
      throw new ApiError("INVALID_ARGUMENT", "字段单位格式不正确");
    }

    return {
      key: createId(`field-${index}`, idContext),
      label,
      type: field.type,
      ...(field.type === "number" && field.unit?.trim()
        ? { unit: field.unit.trim() }
        : {}),
      required: field.required === true,
      status: "active",
      sortOrder: (index + 1) * 10,
      ...(field.type === "single_choice"
        ? {
            options: validateChoiceOptions(
              field.options,
              createId,
              idContext,
              index,
              false,
            ),
          }
        : {}),
    };
  });
}

function validateUpdateFields(fields, createId, idContext) {
  if (!Array.isArray(fields) || fields.length < 1 || fields.length > 10) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "自定义模板需要包含 1 至 10 个字段",
    );
  }

  const normalized = fields.map((field, index) => {
    const key =
      typeof field.key === "string" && field.key.trim()
        ? field.key.trim()
        : createId(`field-${index}`, idContext);
    const label =
      typeof field.label === "string" ? field.label.trim() : "";
    const status = field.status === "inactive" ? "inactive" : "active";

    if (
      !label ||
      label.length > 30 ||
      !CUSTOM_FIELD_TYPES.has(field.type)
    ) {
      throw new ApiError(
        "INVALID_ARGUMENT",
        "请完整填写有效的字段名称和类型",
      );
    }

    if (
      field.unit !== undefined &&
      (field.type !== "number" ||
        typeof field.unit !== "string" ||
        field.unit.trim().length > 20)
    ) {
      throw new ApiError("INVALID_ARGUMENT", "字段单位格式不正确");
    }

    return {
      key,
      label,
      type: field.type,
      ...(field.type === "number" && field.unit?.trim()
        ? { unit: field.unit.trim() }
        : {}),
      required: field.required === true,
      status,
      sortOrder:
        Number.isFinite(field.sortOrder) && field.sortOrder > 0
          ? field.sortOrder
          : (index + 1) * 10,
      ...(field.type === "single_choice"
        ? {
            options: validateChoiceOptions(
              field.options,
              createId,
              idContext,
              index,
              true,
            ),
          }
        : {}),
    };
  });

  if (!normalized.some((field) => field.status === "active")) {
    throw new ApiError(
      "INVALID_ARGUMENT",
      "模板至少需要保留一个启用字段",
    );
  }

  if (new Set(normalized.map((field) => field.key)).size !== normalized.length) {
    throw new ApiError("INVALID_ARGUMENT", "模板字段编号不能重复");
  }

  return normalized;
}

function createTemplateApi({
  getCaller,
  templateStore,
  createId,
  getMutationContext,
  now,
  reportError = () => {},
} = {}) {
  async function getMutationAudit({ created = false } = {}) {
    if (typeof getMutationContext !== "function") {
      return {};
    }

    const context = await getMutationContext();

    if (
      context?.via !== "external_api" ||
      typeof context.externalTokenId !== "string" ||
      !context.externalTokenId
    ) {
      return {};
    }

    return {
      ...(created
        ? {
            createdVia: "external_api",
            createdByExternalTokenId: context.externalTokenId,
          }
        : {}),
      updatedVia: "external_api",
      updatedByExternalTokenId: context.externalTokenId,
    };
  }

  const actions = {
    async listTemplates(data) {
      if (!data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择家庭");
      }

      const caller = await getCaller();
      const membership = await templateStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以查看模板",
        );
      }

      const customTemplates =
        await templateStore.listCustomTemplates(data.familyId, {
          includeInactive: data.includeInactive === true,
        });

      return {
        templates: [
          ...listSystemTemplates(),
          ...customTemplates.map(toTemplateSummary),
        ],
      };
    },

    async createCustomTemplate(data, request) {
      if (
        typeof request.requestId !== "string" ||
        !request.requestId.trim()
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "缺少本次保存的请求编号，请重试",
        );
      }

      const name = typeof data.name === "string" ? data.name.trim() : "";

      if (
        !data.familyId ||
        !name ||
        name.length > 40
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请填写 1 至 40 个字的模板名称",
        );
      }

      const caller = await getCaller();
      const membership = await templateStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以创建模板",
        );
      }

      const idContext = {
        callerUserId: caller._id,
        requestId: request.requestId,
      };
      const templateId = createId("template", idContext);
      const mutationAudit = await getMutationAudit({ created: true });
      const timestamp = now();
      const result = await templateStore.createCustomTemplate({
        _id: templateId,
        familyId: data.familyId,
        originTemplateId: templateId,
        name,
        ...normalizeTemplateColor(data.colorKey, data.colorHex),
        status: "active",
        fields: validateCreateFields(
          data.fields,
          createId,
          idContext,
        ),
        defaultNotificationTimes: [],
        sortOrder: 100,
        createdByUserId: caller._id,
        updatedByUserId: caller._id,
        ...mutationAudit,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以创建模板",
        );
      }

      return {
        template: toTemplateSummary(result.template),
        replayed: result.outcome === "replayed",
      };
    },

    async updateCustomTemplate(data, request) {
      const name = typeof data.name === "string" ? data.name.trim() : "";

      if (
        !data.familyId ||
        !data.templateId ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1 ||
        !name ||
        name.length > 40
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请提供模板、当前版本和 1 至 40 个字的模板名称",
        );
      }

      const caller = await getCaller();
      const membership = await templateStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以修改模板",
        );
      }

      const idContext = {
        callerUserId: caller._id,
        requestId: request.requestId,
        templateId: data.templateId,
      };
      const mutationAudit = await getMutationAudit();
      const result = await templateStore.updateCustomTemplate({
        familyId: data.familyId,
        templateId: data.templateId,
        expectedRevision: data.expectedRevision,
        name,
        ...normalizeTemplateColor(data.colorKey, data.colorHex),
        fields: validateUpdateFields(
          data.fields,
          createId,
          idContext,
        ),
        updatedByUserId: caller._id,
        updatedAt: now(),
        mutationAudit,
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以修改模板",
        );
      }

      if (result.outcome === "not-found") {
        throw new ApiError("TEMPLATE_NOT_FOUND", "没有找到这个自定义模板");
      }

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "模板已被其他人修改，请刷新后重试",
        );
      }

      if (result.outcome === "history-conflict") {
        throw new ApiError(
          "TEMPLATE_HISTORY_CONFLICT",
          "已有记录使用这个字段，可以停用但不能删除或改变类型",
        );
      }

      return {
        template: toTemplateSummary(result.template),
      };
    },

    async setTemplateStatus(data) {
      if (
        !data.familyId ||
        !data.templateId ||
        !Number.isInteger(data.expectedRevision) ||
        data.expectedRevision < 1 ||
        !["active", "inactive"].includes(data.status)
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请提供模板、当前版本和有效状态",
        );
      }

      const caller = await getCaller();
      const membership = await templateStore.getActiveMembership(
        data.familyId,
        caller._id,
      );

      if (!membership) {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以更改模板状态",
        );
      }

      const mutationAudit = await getMutationAudit();
      const result = await templateStore.setTemplateStatus({
        familyId: data.familyId,
        templateId: data.templateId,
        expectedRevision: data.expectedRevision,
        status: data.status,
        updatedByUserId: caller._id,
        updatedAt: now(),
        mutationAudit,
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "TEMPLATE_ACCESS_DENIED",
          "只有当前家庭的有效成员可以更改模板状态",
        );
      }

      if (result.outcome === "not-found") {
        throw new ApiError("TEMPLATE_NOT_FOUND", "没有找到这个自定义模板");
      }

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "模板已被其他人修改，请刷新后重试",
        );
      }

      return {
        template: toTemplateSummary(result.template),
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
  createTemplateApi,
};
