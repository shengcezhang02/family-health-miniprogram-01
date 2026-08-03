const cloud = require("wx-server-sdk");
const { createHash, createHmac } = require("node:crypto");

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
const careShareHashKey =
  process.env.CARE_SHARE_HASH_KEY ||
  "family-health-local-care-share-key";

if (!process.env.CARE_SHARE_HASH_KEY) {
  console.warn(
    "CARE_SHARE_HASH_KEY is not configured; using the local development key",
  );
}

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
  createReminderId: ({ callerUserId, requestId }) =>
    `reminder-${createHash("sha256")
      .update(`${callerUserId}\n${requestId}`)
      .digest("hex")
      .slice(0, 32)}`,
  createRuleId: ({ callerUserId, requestId }) =>
    `rule-${createHash("sha256")
      .update(`${callerUserId}\n${requestId}`)
      .digest("hex")
      .slice(0, 32)}`,
  createCheckInRecordId: ({ reminderId }) =>
    `record-${createHash("sha256")
      .update(`check-in\n${reminderId}`)
      .digest("hex")
      .slice(0, 32)}`,
  hashCareShareToken: (token) =>
    createHmac("sha256", careShareHashKey)
      .update(`care-share-digest-v1\n${token}`)
      .digest("hex"),
  now: () => new Date(),
  reportError: (error) => {
    console.error("health-item-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
