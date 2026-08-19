const {
  getExternalAccessAction,
} = require("./external-access-policy");

function errorResult(requestId, code, message) {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
    },
  };
}

function createExternalBusinessRouter({
  isEnabled,
  services = {},
} = {}) {
  if (typeof isEnabled !== "function") {
    throw new TypeError("isEnabled must be a function");
  }

  return {
    async execute(request = {}, actor = null) {
      if (!isEnabled()) {
        return errorResult(
          request.requestId,
          "EXTERNAL_ACCESS_DISABLED",
          "外部访问实验功能尚未开启",
        );
      }

      const definition = getExternalAccessAction(request.action);

      if (!definition) {
        return errorResult(
          request.requestId,
          "ACTION_NOT_ALLOWED",
          "这个外部动作不在允许范围内",
        );
      }

      const service =
        services[`${definition.service}:${definition.mode}`] ||
        services[definition.service];

      if (typeof service !== "function") {
        return errorResult(
          request.requestId,
          "SERVICE_NOT_READY",
          "这个业务能力尚未接入外部访问",
        );
      }

      return service(
        {
          action: definition.operation,
          requestId: request.requestId,
          data: request.payload ?? {},
        },
        actor,
      );
    },
  };
}

module.exports = {
  createExternalBusinessRouter,
};
