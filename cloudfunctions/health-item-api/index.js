const cloud = require("wx-server-sdk");
const { createHash } = require("node:crypto");

const {
  createHealthItemApi,
} = require("./src/create-health-item-api");
const {
  createCloudHealthItemStore,
} = require("./src/create-cloud-health-item-store");
const { getSystemTemplate } = require("./src/system-templates");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const healthItemStore = createCloudHealthItemStore(cloud.database());
const api = createHealthItemApi({
  getCaller: async () => {
    const { OPENID: openId } = cloud.getWXContext();
    return healthItemStore.getUserByOpenId(openId);
  },
  healthItemStore,
  getSystemTemplate,
  createRecordId: ({ callerUserId, requestId }) =>
    `record-${createHash("sha256")
      .update(`${callerUserId}\n${requestId}`)
      .digest("hex")
      .slice(0, 32)}`,
  now: () => new Date(),
  reportError: (error) => {
    console.error("health-item-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
