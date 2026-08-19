const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const ERROR_STATUS = Object.freeze({
  ACTION_NOT_ALLOWED: 400,
  EXTERNAL_ACCESS_DISABLED: 404,
  INVALID_REQUEST: 400,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  HTTPS_REQUIRED: 426,
  INVALID_CREDENTIAL: 401,
  SERVICE_NOT_READY: 503,
  FAMILY_ACCESS_DENIED: 403,
  FAMILY_EXTERNAL_ACCESS_NOT_READY: 403,
  RESOURCE_NOT_FOUND: 404,
  TEMPLATE_NOT_AVAILABLE: 404,
  INVALID_VALUES: 422,
  REVISION_CONFLICT: 409,
  REQUEST_CONFLICT: 409,
  RATE_LIMITED: 429,
});

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Strict-Transport-Security":
        "max-age=31536000; includeSubDomains",
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode, requestId, code, message) {
  return response(statusCode, {
    ok: false,
    requestId,
    error: {
      code,
      message,
    },
  });
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  const target = name.toLowerCase();
  const key = Object.keys(headers).find(
    (candidate) => candidate.toLowerCase() === target,
  );
  return key ? headers[key] : undefined;
}

function hasExplicitPlainHttp(event) {
  const forwarded = getHeader(event.headers, "x-forwarded-proto");
  const protocol =
    typeof forwarded === "string"
      ? forwarded.split(",")[0].trim().toLowerCase()
      : event.requestContext?.protocol?.toLowerCase();

  return protocol === "http" || protocol === "http/1.1";
}

function parseRequestBody(body) {
  if (body && typeof body === "object") {
    return body;
  }

  if (typeof body !== "string") {
    throw new TypeError("请求体必须是 JSON");
  }

  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw new TypeError("请求体过大");
  }

  const parsed = JSON.parse(body);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new TypeError("请求体必须是 JSON 对象");
  }

  return parsed;
}

function validateActionRequest(request) {
  if (
    typeof request.action !== "string" ||
    !request.action ||
    typeof request.requestId !== "string" ||
    !request.requestId ||
    request.requestId.length > 120 ||
    (request.payload !== undefined &&
      (!request.payload ||
        Array.isArray(request.payload) ||
        typeof request.payload !== "object"))
  ) {
    throw new TypeError("请求格式不正确");
  }

  return {
    action: request.action,
    requestId: request.requestId,
    payload: request.payload ?? {},
  };
}

function safeIdentifier(value, maxLength = 120) {
  return typeof value === "string" && value.length <= maxLength
    ? value
    : undefined;
}

function createAccessEvent({
  eventId,
  actor,
  request,
  result,
  durationMs,
  accessedAt,
}) {
  const payload = request.payload || {};
  const resourceId = [
    payload.itemId,
    payload.recordId,
    payload.reminderId,
    payload.recurringRuleId,
    payload.ruleId,
    payload.templateId,
  ]
    .map((value) => safeIdentifier(value))
    .find(Boolean);
  const event = {
    _id: eventId,
    tokenId: actor.externalTokenId,
    ownerUserId: actor.userId,
    requestId: request.requestId,
    action: request.action,
    ok: result?.ok === true,
    resultCode: result?.ok
      ? "OK"
      : result?.error?.code || "INTERNAL_ERROR",
    durationMs,
    accessedAt,
  };
  const familyId = safeIdentifier(payload.familyId);
  const resourceType = safeIdentifier(payload.itemType, 40);

  if (familyId) {
    event.familyId = familyId;
  }

  if (resourceType) {
    event.resourceType = resourceType;
  }

  if (resourceId) {
    event.resourceId = resourceId;
  }

  return event;
}

function createExternalAccessApi({
  isEnabled,
  authenticateAccessToken,
  dispatchBusinessAction,
  recordAccess,
  createEventId = () => undefined,
  now = () => new Date(),
  reportError = () => {},
} = {}) {
  if (
    typeof isEnabled !== "function" ||
    typeof dispatchBusinessAction !== "function"
  ) {
    throw new TypeError(
      "isEnabled and dispatchBusinessAction must be functions",
    );
  }

  return {
    async handle(event = {}) {
      if (!isEnabled()) {
        return errorResponse(
          404,
          undefined,
          "NOT_FOUND",
          "接口不存在",
        );
      }

      if (hasExplicitPlainHttp(event)) {
        return errorResponse(
          426,
          undefined,
          "HTTPS_REQUIRED",
          "此接口只接受 HTTPS 请求",
        );
      }

      if ((event.httpMethod || "").toUpperCase() !== "POST") {
        return errorResponse(
          405,
          undefined,
          "METHOD_NOT_ALLOWED",
          "只支持 POST 请求",
        );
      }

      if (event.path !== "/v1/action") {
        return errorResponse(
          404,
          undefined,
          "NOT_FOUND",
          "接口不存在",
        );
      }

      let request;

      try {
        request = validateActionRequest(parseRequestBody(event.body));
      } catch {
        return errorResponse(
          400,
          undefined,
          "INVALID_REQUEST",
          "请求格式不正确",
        );
      }

      if (
        typeof authenticateAccessToken !== "function" ||
        typeof recordAccess !== "function"
      ) {
        return errorResponse(
          503,
          request.requestId,
          "SERVICE_NOT_READY",
          "外部访问服务尚未配置完成",
        );
      }

      let actor;

      try {
        actor = await authenticateAccessToken(
          getHeader(event.headers, "authorization"),
        );
      } catch (error) {
        try {
          reportError("authenticate", error);
        } catch {}
        return errorResponse(
          500,
          request.requestId,
          "INTERNAL_ERROR",
          "服务暂时不可用，请稍后重试",
        );
      }

      if (actor?.ok === false || !actor?.externalTokenId) {
        return errorResponse(
          401,
          request.requestId,
          "INVALID_CREDENTIAL",
          "访问凭证无效或已撤销",
        );
      }

      const startedAt = now();
      let result;

      try {
        result = await dispatchBusinessAction(request, actor);
      } catch (error) {
        try {
          reportError("dispatch", error);
        } catch {}
        result = {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "INTERNAL_ERROR",
            message: "服务暂时不可用，请稍后重试",
          },
        };
      }

      try {
        const accessedAt = now();
        const accessRecordResult = await recordAccess(
          createAccessEvent({
            eventId: createEventId(),
            actor,
            request,
            result,
            durationMs: Math.max(
              0,
              accessedAt.getTime() - startedAt.getTime(),
            ),
            accessedAt,
          }),
        );

        if (accessRecordResult?.outcome === "token-unavailable") {
          return errorResponse(
            401,
            request.requestId,
            "INVALID_CREDENTIAL",
            "访问凭证无效或已撤销",
          );
        }

        if (
          accessRecordResult?.outcome &&
          accessRecordResult.outcome !== "recorded"
        ) {
          throw new Error("Unexpected access record outcome");
        }
      } catch (error) {
        try {
          reportError("record-access", error);
        } catch {}
        return errorResponse(
          500,
          request.requestId,
          "INTERNAL_ERROR",
          "服务暂时不可用，请稍后重试",
        );
      }

      if (result?.ok) {
        return response(200, result);
      }

      const code = result?.error?.code || "INTERNAL_ERROR";
      const statusCode = ERROR_STATUS[code] || 500;
      return response(statusCode, {
        ok: false,
        requestId: request.requestId,
        error: {
          code,
          message:
            result?.error?.message ||
            "服务暂时不可用，请稍后重试",
        },
      });
    },
  };
}

module.exports = {
  createExternalAccessApi,
};
