const { cloudEnvId } = require("./config/environment");
const {
  createReadThroughCache,
} = require("./services/read-through-cache");
const {
  createPersistentReadCache,
} = require("./services/persistent-read-cache");

const READ_CACHE_TTL_MS = 60_000;
const PERSISTENT_CACHEABLE_READS = new Set([
  "profile-api:listFamilyMembers",
  "template-api:listTemplates",
  "query-api:getRecordTimeline",
  "query-api:getDailyHealth",
  "query-api:getDashboardData",
  "query-api:getAnalysisData",
]);
const CACHEABLE_READS = new Set([
  "family-api:bootstrap",
  "profile-api:listFamilyMembers",
  "profile-api:getMemberProfile",
  "template-api:listTemplates",
  "health-item-api:getHealthItem",
  "query-api:getRecordTimeline",
  "query-api:getDailyHealth",
  "query-api:getDashboardData",
  "query-api:getAnalysisData",
  "query-api:listDeletedRecords",
]);
const READ_ONLY_ACTIONS = new Set([
  ...CACHEABLE_READS,
  "family-api:resolveInvite",
  "share-api:resolveCareShare",
]);

App({
  globalData: {
    cloudEnvId,
  },

  onLaunch() {
    this._readCache = createReadThroughCache({
      ttlMs: READ_CACHE_TTL_MS,
    });
    this._persistentReadCache = this._createPersistentReadCache();
    this._persistentReadCache.restoreAccess();

    if (!wx.cloud) {
      console.error("当前微信基础库不支持云开发");
      return;
    }

    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true,
    });
  },

  async callCloudApi(
    name,
    action,
    data,
    requestId,
    { fresh = false } = {},
  ) {
    const cacheKey = `${name}:${action}`;
    const readKey = this._getCloudReadKey(name, action, data);
    const load = async () => {
      const response = await wx.cloud.callFunction({
        name,
        data: {
          action,
          requestId:
            requestId ||
            `${action}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 10)}`,
          data,
        },
      });
      const result = response.result;

      if (!result?.ok) {
        const error = new Error(
          result?.error?.message || "服务连接失败",
        );
        error.code = result?.error?.code;
        throw error;
      }

      if (
        PERSISTENT_CACHEABLE_READS.has(cacheKey) &&
        data?.familyId
      ) {
        this._getPersistentReadCache().write({
          key: readKey,
          familyId: data.familyId,
          value: result.data,
        });
      }

      return result.data;
    };

    if (!CACHEABLE_READS.has(cacheKey)) {
      return load();
    }

    return this._getReadCache().get(readKey, load, { fresh });
  },

  async callFamilyApi(action, data, options) {
    const result = await this._callApi(
      "family-api",
      action,
      data,
      undefined,
      options,
    );

    if (action === "bootstrap") {
      this._getPersistentReadCache().verifyAccess({
        userId: result.user?.id,
        families: result.families || [],
      });
      this._prefetchEditorData(result.families || []);
    }

    return result;
  },

  async callProfileApi(action, data, options) {
    return this._callApi(
      "profile-api",
      action,
      data,
      undefined,
      options,
    );
  },

  async callTemplateApi(action, data, options) {
    return this._callApi(
      "template-api",
      action,
      data,
      undefined,
      options,
    );
  },

  async callHealthItemApi(action, data, requestId, options) {
    return this._callApi(
      "health-item-api",
      action,
      data,
      requestId,
      options,
    );
  },

  async callShareApi(action, data, requestId, options) {
    const functionName =
      action === "submitCareShare" ? "health-item-api" : "share-api";
    return this._callApi(
      functionName,
      action,
      data,
      requestId,
      options,
    );
  },

  async callQueryApi(action, data, options) {
    return this.callCloudApi(
      "query-api",
      action,
      data,
      undefined,
      options,
    );
  },

  getCachedCloudApi(name, action, data) {
    const cacheKey = `${name}:${action}`;

    if (
      !PERSISTENT_CACHEABLE_READS.has(cacheKey) ||
      !data?.familyId
    ) {
      return undefined;
    }

    return this._getPersistentReadCache().read({
      key: this._getCloudReadKey(name, action, data),
      familyId: data.familyId,
    });
  },

  getCachedFamily(familyId) {
    return this._getPersistentReadCache().getFamily(familyId);
  },

  getCachedUserId() {
    return this._getPersistentReadCache().getVerifiedUserId();
  },

  async callReminderMaterializer(data) {
    return this._callApi(
      "reminder-materializer",
      "materialize",
      data,
    );
  },

  async _callApi(name, action, data, requestId, options) {
    const result = await this.callCloudApi(
      name,
      action,
      data,
      requestId,
      options,
    );

    if (!READ_ONLY_ACTIONS.has(`${name}:${action}`)) {
      this._getReadCache().clear();
    }

    return result;
  },

  _getReadCache() {
    if (!this._readCache) {
      this._readCache = createReadThroughCache({
        ttlMs: READ_CACHE_TTL_MS,
      });
    }

    return this._readCache;
  },

  _createPersistentReadCache() {
    return createPersistentReadCache({
      get: (key) => wx.getStorageSync(key),
      set: (key, value) => wx.setStorageSync(key, value),
      remove: (key) => wx.removeStorageSync(key),
    });
  },

  _getPersistentReadCache() {
    if (!this._persistentReadCache) {
      this._persistentReadCache =
        this._createPersistentReadCache();
    }

    return this._persistentReadCache;
  },

  _getCloudReadKey(name, action, data) {
    return `${name}:${action}:${JSON.stringify(data || {})}`;
  },

  _prefetchEditorData(families) {
    this._editorPrefetchedFamilyIds =
      this._editorPrefetchedFamilyIds || new Set();

    for (const family of families) {
      if (
        !family?.id ||
        this._editorPrefetchedFamilyIds.has(family.id)
      ) {
        continue;
      }

      this._editorPrefetchedFamilyIds.add(family.id);
      Promise.all([
        this.callProfileApi("listFamilyMembers", {
          familyId: family.id,
        }),
        this.callTemplateApi("listTemplates", {
          familyId: family.id,
        }),
      ]).catch(() => {
        // 预取只是提速；失败时由真正打开表单的请求正常重试。
      });
    }
  },

  getReadCacheRevision() {
    return this._getReadCache().getRevision();
  },
});
