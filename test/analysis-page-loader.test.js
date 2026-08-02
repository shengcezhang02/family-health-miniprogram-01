const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAnalysisPageLoader,
} = require("../miniprogram/services/analysis-page-loader");

test("进阶分析先显示已验证的本地缓存，再用云端数据替换", async () => {
  const cached = {
    records: [{ id: "cached" }],
    medicationReminders: [],
    members: [{ id: "user-1", displayName: "小明", isSelf: true }],
  };
  const fresh = {
    records: [{ id: "fresh" }],
    medicationReminders: [],
    members: [{ id: "user-1", displayName: "小明", isSelf: true }],
  };
  const loader = createAnalysisPageLoader({
    bootstrapFamily: async () => ({
      user: { id: "user-1" },
      families: [{ id: "family-1", name: "我的家庭" }],
    }),
    getAnalysisData: async () => fresh,
    resolveCurrentFamily: (families) => families[0],
    getCachedAnalysisData: () => cached,
    getCachedUserId: () => "user-1",
    peekCurrentFamilyId: () => "family-1",
    getCachedFamily: () => ({ id: "family-1", name: "我的家庭" }),
  });
  const snapshots = [];

  assert.deepEqual(loader.getStartupSnapshot(), {
    userId: "user-1",
    family: { id: "family-1", name: "我的家庭" },
    ...cached,
    members: [
      {
        id: "user-1",
        displayName: "小明",
        isSelf: true,
        displayLabel: "小明（我）",
      },
    ],
  });

  const result = await loader.load({
    onCached: (snapshot) => snapshots.push(snapshot),
    fresh: true,
  });

  assert.equal(snapshots[0].records[0].id, "cached");
  assert.equal(result.records[0].id, "fresh");
  assert.equal(result.family.id, "family-1");
});
