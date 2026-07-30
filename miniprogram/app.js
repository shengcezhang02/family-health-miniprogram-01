const { cloudEnvId } = require("./config/environment");
const {
  createReadThroughCache,
} = require("./services/read-through-cache");

const READ_CACHE_TTL_MS = 60_000;
const CACHEABLE_READS = new Set([
  "family-api:bootstrap",
  "profile-api:listFamilyMembers",
  "profile-api:getMemberProfile",
  "template-api:listTemplates",
  "health-item-api:getHealthItem",
  "query-api:getRecordTimeline",
  "query-api:getDailyHealth",
  "query-api:listDeletedRecords",
]);
const READ_ONLY_ACTIONS = new Set([
  ...CACHEABLE_READS,
  "family-api:resolveInvite",
]);

App({
  globalData: {
    cloudEnvId,
  },

  onLaunch() {
    this._readCache = createReadThroughCache({
      ttlMs: READ_CACHE_TTL_MS,
    });

    if (!wx.cloud) {
      console.error("当前微信基础库不支持云开发");
      return;
    }

    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true,
    });
  },

  async callCloudApi(name, action, data, requestId) {
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

      return result.data;
    };
    const cacheKey = `${name}:${action}`;

    if (!CACHEABLE_READS.has(cacheKey)) {
      return load();
    }

    return this._getReadCache().get(
      `${cacheKey}:${JSON.stringify(data || {})}`,
      load,
    );
  },

  async callFamilyApi(action, data) {
    return this._callApi("family-api", action, data);
  },

  async callProfileApi(action, data) {
    return this._callApi("profile-api", action, data);
  },

  async callTemplateApi(action, data) {
    return this._callApi("template-api", action, data);
  },

  async callHealthItemApi(action, data, requestId) {
    return this._callApi(
      "health-item-api",
      action,
      data,
      requestId,
    );
  },

  async callQueryApi(action, data) {
    return this.callCloudApi("query-api", action, data);
  },

  async _callApi(name, action, data, requestId) {
    const result = await this.callCloudApi(
      name,
      action,
      data,
      requestId,
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

  getReadCacheRevision() {
    return this._getReadCache().getRevision();
  },
});
