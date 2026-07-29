const { listSystemTemplates } = require("./system-templates");

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createTemplateApi({
  getCaller,
  templateStore,
  reportError = () => {},
} = {}) {
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

      return {
        templates: listSystemTemplates(),
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
          data: await action(request.data ?? {}),
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
