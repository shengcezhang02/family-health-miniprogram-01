const cloud = require("wx-server-sdk");
const { randomUUID } = require("node:crypto");

const { createProfileApi } = require("./src/create-profile-api");
const {
  createCloudProfileStore,
} = require("./src/create-cloud-profile-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const api = createProfileApi({
  getCallerIdentity: async () => {
    const context = cloud.getWXContext();

    return {
      openId: context.OPENID,
    };
  },
  profileStore: createCloudProfileStore(cloud.database()),
  createId: randomUUID,
  now: () => new Date(),
  reportError: (error) => {
    console.error("profile-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
