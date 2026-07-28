const cloud = require("wx-server-sdk");
const { randomUUID } = require("node:crypto");

const { createFamilyApi } = require("./src/create-family-api");
const {
  createCloudFamilyStore,
} = require("./src/create-cloud-family-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const api = createFamilyApi({
  getCallerIdentity: async () => {
    const context = cloud.getWXContext();

    return {
      openId: context.OPENID,
    };
  },
  familyStore: createCloudFamilyStore(db),
  createId: randomUUID,
  now: () => new Date(),
  reportError: (error) => {
    console.error("family-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
