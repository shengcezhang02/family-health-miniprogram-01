const cloud = require("wx-server-sdk");
const { createHash } = require("node:crypto");

const {
  createCareShareApi,
} = require("./src/create-care-share-api");
const {
  createCareShareSecurity,
} = require("./src/create-care-share-security");
const {
  createCloudCareShareStore,
} = require("./src/create-cloud-care-share-store");
const { getSystemTemplate } = require("./src/system-templates");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const hashKey =
  process.env.CARE_SHARE_HASH_KEY ||
  "family-health-local-care-share-key";
const security = createCareShareSecurity({ hashKey });
const careShareStore = createCloudCareShareStore(db);

if (!process.env.CARE_SHARE_HASH_KEY) {
  console.warn(
    "CARE_SHARE_HASH_KEY is not configured; using the local development key",
  );
}

function createStableId(kind, callerUserId, requestId) {
  return `${kind}-${createHash("sha256")
    .update(`${kind}\n${callerUserId}\n${requestId}`)
    .digest("hex")
    .slice(0, 32)}`;
}

const api = createCareShareApi({
  getCaller: async () => {
    const { OPENID: openId } = cloud.getWXContext();
    return careShareStore.getUserByOpenId(openId);
  },
  careShareStore,
  createCredentials: (input) => security.createCredentials(input),
  createShareId: ({ callerUserId, requestId }) =>
    createStableId("share", callerUserId, requestId),
  createReminderId: ({ callerUserId, requestId }) =>
    createStableId("reminder", callerUserId, requestId),
  hashToken: (token) => security.hashToken(token),
  getSystemTemplate,
  now: () => new Date(),
  reportError: (error) => {
    console.error("share-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
