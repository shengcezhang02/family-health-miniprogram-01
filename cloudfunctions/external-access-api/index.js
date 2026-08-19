const cloud = require("wx-server-sdk");
const { createHash, randomUUID } = require("node:crypto");

const {
  createExternalAccessManagement,
  createExternalBusinessRouter,
  createExternalReadServices,
  createExternalWriteServices,
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
const {
  createCloudExternalReadStore,
} = require("./create-cloud-external-read-store");
const {
  getSystemTemplate,
  listSystemTemplates,
} = require("./external-system-templates");
const { createHealthItemApi } = require("./create-health-item-api");
const {
  createCloudHealthItemStore,
} = require("./create-cloud-health-item-store");
const { createTemplateApi } = require("./create-template-api");
const {
  createCloudTemplateStore,
} = require("./create-cloud-template-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database({
  throwOnNotFound: false,
});
const tokenStore = createCloudExternalAccessStore(db);
const externalReadStore = createCloudExternalReadStore(db);
const healthItemStore = createCloudHealthItemStore(db);
const templateStore = createCloudTemplateStore(db);

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
  noticeStore: externalReadStore,
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

const readServices = createExternalReadServices({
  readStore: externalReadStore,
  listSystemTemplates,
});
const writeServices = createExternalWriteServices({
  createHealthItemApiForActor: (actor) =>
    createHealthItemApi({
      getCaller: async () => ({ _id: actor.userId }),
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
      getMutationContext: async () => ({
        via: "external_api",
        externalTokenId: actor.externalTokenId,
      }),
      now: () => new Date(),
      reportError: (error) => {
        console.error("external health item write failed", {
          name: error?.name,
          code: error?.code,
        });
      },
    }),
  createTemplateApiForActor: (actor) =>
    createTemplateApi({
      getCaller: async () => ({ _id: actor.userId }),
      templateStore,
      createId: (kind, { callerUserId, requestId }) =>
        `${kind}-${createHash("sha256")
          .update(`${callerUserId}\n${requestId}\n${kind}`)
          .digest("hex")
          .slice(0, 24)}`,
      getMutationContext: async () => ({
        via: "external_api",
        externalTokenId: actor.externalTokenId,
      }),
      now: () => new Date(),
      reportError: (error) => {
        console.error("external template write failed", {
          name: error?.name,
          code: error?.code,
        });
      },
    }),
  getSystemTemplate,
  systemTemplateStore: externalReadStore,
});
const router = createExternalBusinessRouter({
  isEnabled: () => isExternalAccessEnabled(process.env),
  services: {
    context: readServices.context,
    "healthItems:read": readServices.healthItems,
    "healthItems:write": writeServices.healthItems,
    "templates:read": readServices.templates,
    "templates:write": writeServices.templates,
  },
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
