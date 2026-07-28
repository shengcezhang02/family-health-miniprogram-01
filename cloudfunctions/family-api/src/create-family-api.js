class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createFamilyApi({ getCallerIdentity, reportError = () => {} } = {}) {
  const actions = {
    async bootstrap() {
      const identity = await getCallerIdentity();

      if (!identity?.openId) {
        throw new ApiError(
          "UNAUTHENTICATED",
          "无法确认微信身份，请重新进入小程序",
        );
      }

      return {
        authenticated: true,
      };
    },
  };

  return {
    async handle(request) {
      const action = actions[request.action];

      if (action) {
        try {
          const data = await action();

          return {
            ok: true,
            requestId: request.requestId,
            data,
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
      }

      return {
        ok: false,
        requestId: request.requestId,
        error: {
          code: "UNSUPPORTED_ACTION",
          message: "暂不支持这个操作",
        },
      };
    },
  };
}

module.exports = {
  createFamilyApi,
};
