const cloud = require("wx-server-sdk");

const { createTemplateApi } = require("./src/create-template-api");
const {
  createCloudTemplateStore,
} = require("./src/create-cloud-template-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const templateStore = createCloudTemplateStore(cloud.database());
const api = createTemplateApi({
  getCaller: async () => {
    const { OPENID: openId } = cloud.getWXContext();
    return templateStore.getUserByOpenId(openId);
  },
  templateStore,
  reportError: (error) => {
    console.error("template-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
