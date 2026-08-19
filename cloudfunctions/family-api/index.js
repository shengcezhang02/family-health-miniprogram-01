const cloud = require("wx-server-sdk");
const { randomUUID } = require("node:crypto");

const { createFamilyApi } = require("./create-family-api");
const {
  createCloudFamilyStore,
} = require("./create-cloud-family-store");
const {
  createInviteSecurity,
} = require("./create-invite-security");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const inviteHashKey =
  process.env.INVITE_HASH_KEY ||
  "family-health-local-development-key";
const inviteSecurity = createInviteSecurity({
  hashKey: inviteHashKey,
});

if (!process.env.INVITE_HASH_KEY) {
  console.warn(
    "INVITE_HASH_KEY is not configured; using the local development key",
  );
}

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
  createInviteCredentials: () => inviteSecurity.createCredentials(),
  hashInviteToken: (token) => inviteSecurity.hashToken(token),
  hashInviteShortCode: (shortCode) =>
    inviteSecurity.hashShortCode(shortCode),
  reportError: (error) => {
    console.error("family-api failed", error);
  },
});

exports.main = async (event) => api.handle(event ?? {});
