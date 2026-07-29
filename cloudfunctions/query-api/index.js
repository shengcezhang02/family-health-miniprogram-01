const cloud = require("wx-server-sdk");

const { createQueryApi } = require("./src/create-query-api");
const {
  createCloudQueryStore,
} = require("./src/create-cloud-query-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const queryStore = createCloudQueryStore(cloud.database());
const api = createQueryApi({
  getCaller: async () => {
    const { OPENID: openId } = cloud.getWXContext();
    return queryStore.getUserByOpenId(openId);
  },
  queryStore,
  reportError: (error) => {
    console.error("query-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
