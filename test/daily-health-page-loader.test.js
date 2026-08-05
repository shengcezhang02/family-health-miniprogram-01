const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDailyHealthPageLoader,
} = require("../miniprogram/services/daily-health-page-loader");

test("每日健康主页面自行恢复当前家庭而不依赖路由参数", async () => {
  const calls = [];
  const family = {
    id: "family-2",
    name: "外婆家",
  };
  const loader = createDailyHealthPageLoader({
    bootstrapFamily: async () => {
      calls.push("bootstrap");
      return {
        families: [
          {
            id: "family-1",
            name: "我们家",
          },
          family,
        ],
      };
    },
    resolveCurrentFamily(families) {
      calls.push("resolve");
      return families[1];
    },
    getDailyHealth: async (data) => {
      calls.push(["daily", data]);
      return {
        members: [{ id: "user-1" }],
        records: [{ id: "record-1" }],
        reminders: [{ id: "reminder-1" }],
        recurringRules: [{ id: "rule-1" }],
      };
    },
  });

  const result = await loader.load("2026-07-29");

  assert.deepEqual(result, {
    family,
    members: [{ id: "user-1" }],
    records: [{ id: "record-1" }],
    linkedRecords: [],
    reminders: [{ id: "reminder-1" }],
    recurringRules: [{ id: "rule-1" }],
  });
  assert.deepEqual(calls, [
    "bootstrap",
    "resolve",
    [
      "daily",
      {
        familyId: "family-2",
        date: "2026-07-29",
      },
    ],
  ]);
});

test("云端确认家庭关系后先交付本地快照再刷新云端数据", async () => {
  const calls = [];
  const cachedResult = {
    members: [{ id: "user-1" }],
    records: [{ id: "cached-record" }],
    linkedRecords: [],
    reminders: [],
    recurringRules: [],
  };
  const loader = createDailyHealthPageLoader({
    bootstrapFamily: async () => ({
      user: { id: "user-1" },
      families: [{ id: "family-1", name: "我们家" }],
    }),
    resolveCurrentFamily: (families) => families[0],
    getCachedDailyHealth(data) {
      calls.push(["cache", data]);
      return cachedResult;
    },
    async getDailyHealth(data) {
      calls.push(["cloud", data]);
      return {
        ...cachedResult,
        records: [{ id: "fresh-record" }],
      };
    },
  });

  const snapshots = [];
  const result = await loader.load("2026-07-31", {
    onCached(snapshot) {
      calls.push("show-cache");
      snapshots.push(snapshot);
    },
  });

  assert.equal(snapshots[0].records[0].id, "cached-record");
  assert.equal(result.records[0].id, "fresh-record");
  assert.deepEqual(calls, [
    [
      "cache",
      {
        familyId: "family-1",
        date: "2026-07-31",
      },
    ],
    "show-cache",
    [
      "cloud",
      {
        familyId: "family-1",
        date: "2026-07-31",
      },
    ],
  ]);
});

test("应用重启时可在请求云端前读取上次已验证的每日快照", () => {
  const loader = createDailyHealthPageLoader({
    bootstrapFamily: async () => {
      throw new Error("此时不应请求云端");
    },
    resolveCurrentFamily: () => undefined,
    getDailyHealth: async () => undefined,
    peekCurrentFamilyId: () => "family-1",
    getCachedFamily: () => ({
      id: "family-1",
      name: "我们家",
    }),
    getCachedDailyHealth: () => ({
      members: [{ id: "user-1" }],
      records: [{ id: "cached-record" }],
      reminders: [],
      recurringRules: [],
    }),
  });

  assert.deepEqual(loader.getStartupSnapshot("2026-07-31"), {
    family: {
      id: "family-1",
      name: "我们家",
    },
    members: [{ id: "user-1" }],
    records: [{ id: "cached-record" }],
    linkedRecords: [],
    reminders: [],
    recurringRules: [],
  });
});
