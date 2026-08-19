function copyOptional(target, source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      target[key] = source[key];
    }
  }
  return target;
}

function toPublicOption(option) {
  return copyOptional(
    {
      key: option.key,
      label: option.label,
    },
    option,
    ["status", "sortOrder"],
  );
}

function toPublicField(field) {
  const result = copyOptional(
    {
      key: field.key,
      label: field.label,
      type: field.type,
    },
    field,
    ["unit", "required", "status", "sortOrder", "temporary"],
  );

  if (Array.isArray(field.options)) {
    result.options = field.options.map(toPublicOption);
  }

  return result;
}

function getSystemSetting(family, templateId, index) {
  const setting = Array.isArray(family.systemTemplateSettings)
    ? family.systemTemplateSettings.find(
        (candidate) =>
          candidate?.templateId === templateId ||
          candidate?.id === templateId,
      )
    : null;

  return {
    status: setting?.status === "inactive" ? "inactive" : "active",
    sortOrder:
      Number.isFinite(setting?.sortOrder) && setting.sortOrder > 0
        ? setting.sortOrder
        : (index + 1) * 10,
  };
}

function toPublicSystemTemplate(template, family, index) {
  return {
    id: template.id,
    sourceType: "system",
    name: template.name,
    ...getSystemSetting(family, template.id, index),
    fields: (template.fields || []).map(toPublicField),
  };
}

function toPublicCustomTemplate(template) {
  return copyOptional(
    {
      id: template._id,
      sourceType: "custom",
      name: template.name,
      colorKey: template.colorKey || "purple",
      status: template.status === "inactive" ? "inactive" : "active",
      sortOrder:
        Number.isFinite(template.sortOrder) && template.sortOrder > 0
          ? template.sortOrder
          : 100,
      fields: (template.fields || []).map(toPublicField),
      revision: template.revision,
    },
    template,
    ["colorHex"],
  );
}

function toPublicTemplates(context, listSystemTemplates) {
  return [
    ...listSystemTemplates().map((template, index) =>
      toPublicSystemTemplate(template, context.family, index),
    ),
    ...(context.customTemplates || []).map(toPublicCustomTemplate),
  ].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, "zh-CN"),
  );
}

function errorResult(requestId, code, message) {
  return {
    ok: false,
    requestId,
    error: { code, message },
  };
}

function toIsoString(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function encodeCursor(offset) {
  return Buffer.from(
    JSON.stringify({ version: 1, offset }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return 0;
  }

  if (typeof cursor !== "string" || cursor.length > 200) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    return parsed.version === 1 &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0 &&
      parsed.offset <= 100000
      ? parsed.offset
      : null;
  } catch {
    return null;
  }
}

function parseDateTime(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSafeIdentifier(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 120
  );
}

function normalizeHealthItemList(data = {}) {
  const allowedKeys = new Set([
    "familyId",
    "itemType",
    "subjectUserId",
    "templateType",
    "templateId",
    "from",
    "to",
    "cursor",
    "limit",
  ]);
  if (Object.keys(data).some((key) => !allowedKeys.has(key))) {
    return null;
  }

  if (
    !isSafeIdentifier(data.familyId) ||
    !["record", "reminder", "recurring_rule"].includes(data.itemType)
  ) {
    return null;
  }

  const optionalIdentifiers = [
    data.subjectUserId,
    data.templateId,
  ].filter((value) => value !== undefined);
  if (optionalIdentifiers.some((value) => !isSafeIdentifier(value))) {
    return null;
  }

  if (
    data.templateType !== undefined &&
    !["system", "custom"].includes(data.templateType)
  ) {
    return null;
  }

  const from = parseDateTime(data.from);
  const to = parseDateTime(data.to);
  if (
    from === null ||
    to === null ||
    (from && to && from.getTime() > to.getTime())
  ) {
    return null;
  }

  const offset = decodeCursor(data.cursor);
  if (offset === null) {
    return null;
  }

  const limit =
    data.limit === undefined
      ? 50
      : Number.isInteger(data.limit) && data.limit > 0
        ? Math.min(data.limit, 100)
        : null;
  if (limit === null) {
    return null;
  }

  return {
    familyId: data.familyId,
    itemType: data.itemType,
    ...(data.subjectUserId
      ? { subjectUserId: data.subjectUserId }
      : {}),
    ...(data.templateType ? { templateType: data.templateType } : {}),
    ...(data.templateId ? { templateId: data.templateId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    offset,
    limit,
  };
}

function toPublicRecord(record) {
  return copyOptional(
    {
      itemType: "record",
      id: record._id,
      familyId: record.familyId,
      subjectUserId: record.subjectUserId,
      sourceTemplateType: record.sourceTemplateType,
      sourceTemplateId: record.sourceTemplateId,
      templateNameSnapshot: record.templateNameSnapshot,
      fieldSchemaSnapshot: (record.fieldSchemaSnapshot || []).map(
        toPublicField,
      ),
      values: { ...(record.values || {}) },
      occurredAt: toIsoString(record.occurredAt),
      recordSource: record.recordSource,
      createdByUserId: record.createdByUserId,
      updatedByUserId: record.updatedByUserId,
      revision: record.revision,
      createdAt: toIsoString(record.createdAt),
      updatedAt: toIsoString(record.updatedAt),
      originRecordId: record.originRecordId,
    },
    record,
    ["remark", "sourceReminderId"],
  );
}

function toPublicReminder(reminder) {
  const result = copyOptional(
    {
      itemType: "reminder",
      id: reminder._id,
      familyId: reminder.familyId,
      subjectUserId: reminder.subjectUserId,
      sourceTemplateType: reminder.sourceTemplateType,
      sourceTemplateId: reminder.sourceTemplateId,
      templateNameSnapshot: reminder.templateNameSnapshot,
      fieldSchemaSnapshot: (reminder.fieldSchemaSnapshot || []).map(
        toPublicField,
      ),
      values: { ...(reminder.values || {}) },
      plannedAt: toIsoString(reminder.plannedAt),
      notificationTimes: (reminder.notificationTimes || []).map(
        toIsoString,
      ),
      status: reminder.status,
      creationSource: reminder.creationSource,
      createdByUserId: reminder.createdByUserId,
      updatedByUserId: reminder.updatedByUserId,
      revision: reminder.revision,
      createdAt: toIsoString(reminder.createdAt),
      updatedAt: toIsoString(reminder.updatedAt),
    },
    reminder,
    ["remark", "linkedRecordId"],
  );

  for (const key of ["nextNotificationAt", "completedAt"]) {
    if (reminder[key]) {
      result[key] = toIsoString(reminder[key]);
    }
  }

  return result;
}

function toPublicRecurringRule(rule) {
  const repeat = {
    ...(rule.repeat || {}),
    ...(Array.isArray(rule.repeat?.weekdays)
      ? { weekdays: [...rule.repeat.weekdays] }
      : {}),
  };
  const result = copyOptional(
    {
      itemType: "recurring_rule",
      id: rule._id,
      familyId: rule.familyId,
      subjectUserId: rule.subjectUserId,
      sourceTemplateType: rule.sourceTemplateType,
      sourceTemplateId: rule.sourceTemplateId,
      templateNameSnapshot: rule.templateNameSnapshot,
      fieldSchemaSnapshot: (rule.fieldSchemaSnapshot || []).map(
        toPublicField,
      ),
      values: { ...(rule.values || {}) },
      startDate: rule.startDate,
      endDate: rule.endDate,
      repeat,
      dailyTimes: [...(rule.dailyTimes || [])],
      status: rule.status,
      createdByUserId: rule.createdByUserId,
      updatedByUserId: rule.updatedByUserId,
      revision: rule.revision,
      createdAt: toIsoString(rule.createdAt),
      updatedAt: toIsoString(rule.updatedAt),
    },
    rule,
    ["remark", "pausedByUserId", "pauseReason"],
  );

  if (rule.pausedAt) {
    result.pausedAt = toIsoString(rule.pausedAt);
  }

  return result;
}

function toPublicHealthItem(itemType, item) {
  if (itemType === "record") {
    return toPublicRecord(item);
  }

  if (itemType === "reminder") {
    return toPublicReminder(item);
  }

  if (itemType === "recurring_rule") {
    return toPublicRecurringRule(item);
  }

  return null;
}

function toPublicMembers(context, actorUserId) {
  const usersById = new Map(
    (context.users || []).map((user) => [user._id, user]),
  );

  return context.activeMemberships.map((membership) => ({
    id: membership.userId,
    displayName:
      usersById.get(membership.userId)?.displayName || "家庭成员",
    role: membership.role,
    isSelf: membership.userId === actorUserId,
  }));
}

function createExternalReadServices({
  readStore,
  listSystemTemplates,
} = {}) {
  if (
    typeof readStore?.listFamilyContextsByUserId !== "function" ||
    typeof listSystemTemplates !== "function"
  ) {
    throw new TypeError(
      "readStore.listFamilyContextsByUserId and listSystemTemplates are required",
    );
  }

  return {
    async context(request = {}, actor = {}) {
      const result = await readStore.listFamilyContextsByUserId(
        actor.userId,
      );

      return {
        ok: true,
        requestId: request.requestId,
        data: {
          user: {
            id: result.user._id,
            displayName: result.user.displayName,
          },
          families: result.familyContexts.map((context) => {
            return {
              id: context.family._id,
              name: context.family.name,
              revision: Number.isInteger(context.family.revision)
                ? context.family.revision
                : 1,
              role: context.callerMembership.role,
              externalAccessReady: true,
              members: toPublicMembers(context, actor.userId),
              templates: toPublicTemplates(
                context,
                listSystemTemplates,
              ),
            };
          }),
        },
      };
    },

    async templates(request = {}, actor = {}) {
      if (
        typeof request.data?.familyId !== "string" ||
        !request.data.familyId
      ) {
        return errorResult(
          request.requestId,
          "INVALID_REQUEST",
          "请提供要读取的家庭",
        );
      }

      const context = await readStore.getFamilyContextByUserId(
        request.data?.familyId,
        actor.userId,
      );

      if (!context?.callerMembership) {
        return errorResult(
          request.requestId,
          "FAMILY_ACCESS_DENIED",
          "令牌所有者已不是这个家庭的有效成员",
        );
      }

      return {
        ok: true,
        requestId: request.requestId,
        data: {
          familyId: context.family._id,
          familyRevision: Number.isInteger(context.family.revision)
            ? context.family.revision
            : 1,
          templates: toPublicTemplates(context, listSystemTemplates),
        },
      };
    },

    async healthItems(request = {}, actor = {}) {
      if (
        !["listHealthItems", "getHealthItem"].includes(request.action)
      ) {
        return errorResult(
          request.requestId,
          "ACTION_NOT_ALLOWED",
          "这个健康事项读取动作不受支持",
        );
      }

      const query =
        request.action === "listHealthItems"
          ? normalizeHealthItemList(request.data)
          : isSafeIdentifier(request.data?.familyId) &&
              ["record", "reminder", "recurring_rule"].includes(
                request.data?.itemType,
              ) &&
              isSafeIdentifier(request.data?.itemId)
            ? {
                familyId: request.data.familyId,
                itemType: request.data.itemType,
                itemId: request.data.itemId,
              }
            : null;
      if (!query) {
        return errorResult(
          request.requestId,
          "INVALID_REQUEST",
          "健康事项筛选条件不正确",
        );
      }

      const context = await readStore.getFamilyContextByUserId(
        query.familyId,
        actor.userId,
      );
      if (!context?.callerMembership) {
        return errorResult(
          request.requestId,
          "FAMILY_ACCESS_DENIED",
          "令牌所有者已不是这个家庭的有效成员",
        );
      }
      if (request.action === "getHealthItem") {
        const item = await readStore.getHealthItem(query);

        if (!item || item.deletedAt || item.familyId !== query.familyId) {
          return errorResult(
            request.requestId,
            "RESOURCE_NOT_FOUND",
            "这个健康事项不存在或已删除",
          );
        }

        return {
          ok: true,
          requestId: request.requestId,
          data: {
            item: toPublicHealthItem(query.itemType, item),
          },
        };
      }

      const rawItems = await readStore.listHealthItems({
        ...query,
        limit: query.limit + 1,
      });
      const visibleItems = rawItems.filter((item) => !item.deletedAt);
      const hasNextPage = visibleItems.length > query.limit;
      const items = visibleItems
        .slice(0, query.limit)
        .map((item) => toPublicHealthItem(query.itemType, item));

      return {
        ok: true,
        requestId: request.requestId,
        data: {
          familyId: query.familyId,
          itemType: query.itemType,
          items,
          ...(hasNextPage
            ? { nextCursor: encodeCursor(query.offset + query.limit) }
            : {}),
        },
      };
    },
  };
}

module.exports = {
  createExternalReadServices,
};
