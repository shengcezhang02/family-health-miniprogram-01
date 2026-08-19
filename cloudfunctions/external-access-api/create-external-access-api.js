const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const ERROR_STATUS = Object.freeze({
  ACTION_NOT_ALLOWED: 400,
  EXTERNAL_ACCESS_DISABLED: 404,
  INVALID_REQUEST: 400,
  METHOD_NOT_ALLOWED: 405,
  NOT_FOUND: 404,
  HTTPS_REQUIRED: 426,
  SERVICE_NOT_READY: 503,
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

function createExternalAccessApi({
  isEnabled,
  dispatchBusinessAction,
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

      const result = await dispatchBusinessAction(request);

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
