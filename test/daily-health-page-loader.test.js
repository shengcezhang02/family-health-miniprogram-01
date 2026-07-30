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
        records: [{ id: "record-1" }],
        reminders: [{ id: "reminder-1" }],
      };
    },
  });

  const result = await loader.load("2026-07-29");

  assert.deepEqual(result, {
    family,
    records: [{ id: "record-1" }],
    reminders: [{ id: "reminder-1" }],
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
