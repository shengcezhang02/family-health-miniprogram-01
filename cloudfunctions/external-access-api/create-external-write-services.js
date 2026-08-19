const ITEM_ID_FIELDS = Object.freeze({
  record: "recordId",
  reminder: "reminderId",
  recurring_rule: "ruleId",
});

const EXTERNAL_ERROR_CODES = Object.freeze({
  HEALTH_ITEM_ACCESS_DENIED: "FAMILY_ACCESS_DENIED",
  TEMPLATE_ACCESS_DENIED: "FAMILY_ACCESS_DENIED",
  HEALTH_ITEM_NOT_FOUND: "RESOURCE_NOT_FOUND",
  TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_AVAILABLE",
  INVALID_ARGUMENT: "INVALID_VALUES",
  LOCKED_FIELDS_CANNOT_CHANGE: "INVALID_VALUES",
  REMINDER_ALREADY_COMPLETED: "INVALID_VALUES",
  RULE_STATE_CONFLICT: "INVALID_VALUES",
  SUBJECT_INACTIVE: "INVALID_VALUES",
  TEMPLATE_HISTORY_CONFLICT: "INVALID_VALUES",
  UNSUPPORTED_ACTION: "ACTION_NOT_ALLOWED",
});

const HEALTH_ITEM_ALLOWED_KEYS = Object.freeze({
  createRecord: new Set([
    "familyId",
    "subjectUserId",
    "sourceTemplateType",
    "sourceTemplateId",
    "occurredAt",
    "values",
    "remark",
    "temporaryFields",
  ]),
  createReminder: new Set([
    "familyId",
    "subjectUserId",
    "sourceTemplateType",
    "sourceTemplateId",
    "plannedAt",
    "notificationTimes",
    "values",
    "remark",
    "temporaryFields",
  ]),
  createRecurringRule: new Set([
    "familyId",
    "subjectUserId",
    "sourceTemplateType",
    "sourceTemplateId",
    "values",
    "remark",
    "temporaryFields",
    "startDate",
    "endDate",
    "repeat",
    "dailyTimes",
  ]),
  updateHealthItem: new Set([
    "itemType",
    "itemId",
    "expectedRevision",
    "occurredAt",
    "plannedAt",
    "notificationTimes",
    "values",
    "remark",
    "startDate",
    "endDate",
    "repeat",
    "dailyTimes",
  ]),
  checkInReminder: new Set([
    "itemType",
    "itemId",
    "reminderId",
    "expectedRevision",
    "occurredAt",
    "values",
    "remark",
  ]),
  pauseRule: new Set([
    "itemType",
    "itemId",
    "ruleId",
    "expectedRevision",
  ]),
  resumeRule: new Set([
    "itemType",
    "itemId",
    "ruleId",
    "expectedRevision",
  ]),
  softDeleteItem: new Set([
    "itemType",
    "itemId",
    "expectedRevision",
  ]),
});

const TEMPLATE_ALLOWED_KEYS = Object.freeze({
  createCustomTemplate: new Set([
    "familyId",
    "name",
    "colorKey",
    "colorHex",
    "fields",
  ]),
  updateCustomTemplate: new Set([
    "familyId",
    "templateId",
    "expectedRevision",
    "name",
    "colorKey",
    "colorHex",
    "fields",
  ]),
  setTemplateStatus: new Set([
    "familyId",
    "templateId",
    "expectedRevision",
    "status",
  ]),
  copySystemTemplate: new Set([
    "familyId",
    "systemTemplateId",
    "name",
    "colorKey",
    "colorHex",
  ]),
  updateSystemTemplateSettings: new Set([
    "familyId",
    "systemTemplateId",
    "expectedRevision",
    "status",
    "sortOrder",
  ]),
});

function validateExternalData(action, data, allowedKeysByAction) {
  const allowedKeys = allowedKeysByAction[action];
  return Boolean(
    allowedKeys &&
      data &&
      !Array.isArray(data) &&
      typeof data === "object" &&
      Object.keys(data).every((key) => allowedKeys.has(key)),
  );
}

function invalidExternalData(requestId) {
  return {
    ok: false,
    requestId,
    error: {
      code: "INVALID_VALUES",
      message: "请求包含不支持或不可由外部修改的字段",
    },
  };
}

function toExternalResult(result) {
  if (result?.ok !== false || !result.error?.code) {
    return result;
  }

  return {
    ...result,
    error: {
      ...result.error,
      code:
        EXTERNAL_ERROR_CODES[result.error.code] ||
        result.error.code,
    },
  };
}

function toHealthItemApiData(action, data = {}) {
  const needsTypedItem = new Set([
    "updateHealthItem",
    "softDeleteItem",
  ]);

  if (needsTypedItem.has(action)) {
    const idField = ITEM_ID_FIELDS[data.itemType];

    if (!idField || typeof data.itemId !== "string" || !data.itemId) {
      return data;
    }

    const { itemType, itemId, ...editableData } = data;
    return {
      ...editableData,
      [idField]: itemId,
    };
  }

  if (
    action === "checkInReminder" &&
    !data.reminderId &&
    data.itemType === "reminder" &&
    typeof data.itemId === "string"
  ) {
    const { itemType, itemId, ...checkInData } = data;
    return {
      ...checkInData,
      reminderId: itemId,
    };
  }

  if (
    ["pauseRule", "resumeRule"].includes(action) &&
    !data.ruleId &&
    data.itemType === "recurring_rule" &&
    typeof data.itemId === "string"
  ) {
    const { itemType, itemId, ...ruleData } = data;
    return {
      ...ruleData,
      ruleId: itemId,
    };
  }

  return data;
}

function createExternalWriteServices({
  createHealthItemApiForActor,
  createTemplateApiForActor,
  getSystemTemplate,
  systemTemplateStore,
} = {}) {
  if (typeof createHealthItemApiForActor !== "function") {
    throw new TypeError("createHealthItemApiForActor is required");
  }

  return {
    async healthItems(request = {}, actor = {}) {
      if (!actor?.userId || !actor?.externalTokenId) {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "INVALID_CREDENTIAL",
            message: "访问凭证无效或已撤销",
          },
        };
      }

      if (
        !validateExternalData(
          request.action,
          request.data ?? {},
          HEALTH_ITEM_ALLOWED_KEYS,
        )
      ) {
        return invalidExternalData(request.requestId);
      }

      const result = await createHealthItemApiForActor(actor).handle({
        action: request.action,
        requestId: request.requestId,
        data: toHealthItemApiData(
          request.action,
          request.data ?? {},
        ),
      });
      return toExternalResult(result);
    },

    async templates(request = {}, actor = {}) {
      if (typeof createTemplateApiForActor !== "function") {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "SERVICE_NOT_READY",
            message: "模板写入能力尚未接入",
          },
        };
      }

      let action = request.action;
      let data = request.data ?? {};
      let copiedFromSystemTemplateId;

      if (
        !validateExternalData(
          action,
          data,
          TEMPLATE_ALLOWED_KEYS,
        )
      ) {
        return invalidExternalData(request.requestId);
      }

      if (action === "updateSystemTemplateSettings") {
        const systemTemplate =
          typeof getSystemTemplate === "function"
            ? getSystemTemplate(data.systemTemplateId)
            : null;
        const isValid =
          systemTemplate &&
          typeof data.familyId === "string" &&
          data.familyId &&
          Number.isInteger(data.expectedRevision) &&
          data.expectedRevision > 0 &&
          ["active", "inactive"].includes(data.status) &&
          Number.isFinite(data.sortOrder) &&
          data.sortOrder > 0 &&
          typeof systemTemplateStore?.updateSystemTemplateSettings ===
            "function";

        if (!isValid) {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "INVALID_VALUES",
              message: "请提供家庭版本和有效的系统模板设置",
            },
          };
        }

        const updateResult =
          await systemTemplateStore.updateSystemTemplateSettings({
            actorUserId: actor.userId,
            familyId: data.familyId,
            systemTemplateId: systemTemplate.id,
            expectedRevision: data.expectedRevision,
            status: data.status,
            sortOrder: data.sortOrder,
          });

        if (updateResult.outcome === "permission-denied") {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "FAMILY_ACCESS_DENIED",
              message: "令牌所有者已不是这个家庭的有效成员",
            },
          };
        }

        if (updateResult.outcome === "revision-conflict") {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "REVISION_CONFLICT",
              message: "家庭设置已被其他成员修改，请重新读取后重试",
            },
          };
        }

        if (updateResult.outcome !== "updated") {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "RESOURCE_NOT_FOUND",
              message: "没有找到这个家庭",
            },
          };
        }

        return {
          ok: true,
          requestId: request.requestId,
          data: {
            familyId: data.familyId,
            familyRevision: updateResult.familyRevision,
            setting: updateResult.setting,
          },
        };
      }

      if (action === "copySystemTemplate") {
        const systemTemplate =
          typeof getSystemTemplate === "function"
            ? getSystemTemplate(data.systemTemplateId)
            : null;

        if (!systemTemplate) {
          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "TEMPLATE_NOT_AVAILABLE",
              message: "这个系统模板不存在",
            },
          };
        }

        copiedFromSystemTemplateId = systemTemplate.id;
        action = "createCustomTemplate";
        data = {
          familyId: data.familyId,
          name:
            typeof data.name === "string" && data.name.trim()
              ? data.name
              : `${systemTemplate.name}副本`,
          ...(data.colorKey ? { colorKey: data.colorKey } : {}),
          ...(data.colorHex ? { colorHex: data.colorHex } : {}),
          fields: systemTemplate.fields.map((field) => ({
            label: field.label,
            type: field.type,
            ...(field.unit ? { unit: field.unit } : {}),
            required: field.required === true,
            ...(Array.isArray(field.options)
              ? {
                  options: field.options.map((option) => ({
                    label: option.label,
                  })),
                }
              : {}),
          })),
        };
      }

      const result = await createTemplateApiForActor(actor).handle({
        action,
        requestId: request.requestId,
        data,
      });
      const externalResult = toExternalResult(result);

      if (externalResult.ok && copiedFromSystemTemplateId) {
        return {
          ...externalResult,
          data: {
            ...externalResult.data,
            copiedFromSystemTemplateId,
          },
        };
      }

      return externalResult;
    },
  };
}

module.exports = {
  createExternalWriteServices,
};
