const cloud = require("wx-server-sdk");
const { createHash, randomUUID } = require("node:crypto");

const {
  createExternalAccessManagement,
  createExternalBusinessRouter,
  createExternalTokenAuthenticator,
  createExternalTokenSecurity,
  isExternalAccessEnabled,
} = require("./family-health-business");
const {
  createExternalAccessApi,
} = require("./create-external-access-api");
const {
  createCloudExternalAccessStore,
} = require("./create-cloud-external-access-store");
const {
  createExternalAccessFunction,
} = require("./create-external-access-function");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database({
  throwOnNotFound: false,
});
const tokenStore = createCloudExternalAccessStore(db);

function createStableTokenId({ ownerUserId, requestId }) {
  return createHash("sha256")
    .update(`external-access-token-v1\n${ownerUserId}\n${requestId}`)
    .digest("base64url")
    .slice(0, 32);
}

function createConfiguredTokenSecurity() {
  if (!process.env.EXTERNAL_ACCESS_MASTER_KEY) {
    return null;
  }

  return createExternalTokenSecurity({
    masterKey: process.env.EXTERNAL_ACCESS_MASTER_KEY,
    keyVersion:
      process.env.EXTERNAL_ACCESS_KEY_VERSION || "v1",
  });
}

const tokenSecurity = createConfiguredTokenSecurity();
const managementApi = createExternalAccessManagement({
  getCallerIdentity: async () => {
    const context = cloud.getWXContext();
    return { openId: context.OPENID };
  },
  tokenStore,
  tokenSecurity,
  createId: createStableTokenId,
  now: () => new Date(),
  externalBaseUrl: process.env.EXTERNAL_ACCESS_BASE_URL,
  reportError: (error) => {
    console.error("external-access management failed", {
      name: error?.name,
      code: error?.code,
    });
  },
});
const tokenAuthenticator = tokenSecurity
  ? createExternalTokenAuthenticator({
      tokenStore,
      tokenSecurity,
    })
  : null;

const router = createExternalBusinessRouter({
  isEnabled: () => isExternalAccessEnabled(process.env),
  services: {},
});

const api = createExternalAccessApi({
  isEnabled: () => isExternalAccessEnabled(process.env),
  authenticateAccessToken: (authorizationHeader) =>
    tokenAuthenticator
      ? tokenAuthenticator.authenticate(authorizationHeader)
      : {
          ok: false,
          code: "INVALID_CREDENTIAL",
          message: "访问凭证无效或已撤销",
        },
  dispatchBusinessAction: (request, actor) =>
    router.execute(request, actor),
  recordAccess: (event) => tokenStore.recordAccess(event),
  createEventId: randomUUID,
  now: () => new Date(),
  reportError: (stage, error) => {
    console.error("external-access http failed", {
      stage,
      name: error?.name,
      code: error?.code,
    });
  },
});

exports.main = createExternalAccessFunction({
  managementApi,
  httpApi: api,
});
