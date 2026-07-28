const cloud = require("wx-server-sdk");

const { createFamilyApi } = require("./src/create-family-api");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const api = createFamilyApi({
  getCallerIdentity: async () => {
    const context = cloud.getWXContext();

    return {
      openId: context.OPENID,
    };
  },
  reportError: (error) => {
    console.error("family-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
