const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createPersistentReadCache,
} = require("../miniprogram/services/persistent-read-cache");

test("持久快照只有在云端确认账号和家庭关系后才能读取", () => {
  let savedValue;
  const cache = createPersistentReadCache({
    get: () => savedValue,
    set: (_key, value) => {
      savedValue = value;
    },
    remove: () => {
      savedValue = undefined;
    },
    now: () => 1_000,
  });

  cache.write({
    key: "query-api:getDailyHealth:2026-07-31",
    familyId: "family-1",
    value: { reminders: [{ id: "reminder-1" }] },
  });
  assert.equal(
    cache.read({
      key: "query-api:getDailyHealth:2026-07-31",
      familyId: "family-1",
    }),
    undefined,
  );

  cache.verifyAccess({
    userId: "user-1",
    familyIds: ["family-1"],
  });
  cache.write({
    key: "query-api:getDailyHealth:2026-07-31",
    familyId: "family-1",
    value: { reminders: [{ id: "reminder-1" }] },
  });
  assert.deepEqual(
    cache.read({
      key: "query-api:getDailyHealth:2026-07-31",
      familyId: "family-1",
    }),
    { reminders: [{ id: "reminder-1" }] },
  );

  cache.verifyAccess({
    userId: "user-1",
    familyIds: [],
  });
  assert.equal(
    cache.read({
      key: "query-api:getDailyHealth:2026-07-31",
      familyId: "family-1",
    }),
    undefined,
  );
  assert.equal(savedValue, undefined);
});

test("本地存储不可用时不会阻断云端健康数据流程", () => {
  const cache = createPersistentReadCache({
    get: () => undefined,
    set: () => {
      throw new Error("storage full");
    },
    remove: () => {
      throw new Error("storage unavailable");
    },
  });

  assert.doesNotThrow(() => {
    cache.verifyAccess({
      userId: "user-1",
      familyIds: ["family-1"],
    });
    cache.write({
      key: "query-api:getDailyHealth:2026-07-31",
      familyId: "family-1",
      value: { records: [] },
    });
  });
});

test("重新启动后可以恢复上次已验证家庭并立即读取只读快照", () => {
  let savedValue;
  const storage = {
    get: () => savedValue,
    set: (_key, value) => {
      savedValue = value;
    },
    remove: () => {
      savedValue = undefined;
    },
  };
  const firstLaunchCache = createPersistentReadCache({
    ...storage,
    now: () => 1_000,
  });

  firstLaunchCache.verifyAccess({
    userId: "user-1",
    families: [{ id: "family-1", name: "我的家庭" }],
  });
  firstLaunchCache.write({
    key: "query-api:getDailyHealth:2026-07-31",
    familyId: "family-1",
    value: { reminders: [{ id: "reminder-1" }] },
  });

  const restartedCache = createPersistentReadCache({
    ...storage,
    now: () => 2_000,
  });
  assert.deepEqual(restartedCache.restoreAccess(), {
    userId: "user-1",
    families: [{ id: "family-1", name: "我的家庭" }],
  });
  assert.equal(restartedCache.getVerifiedUserId(), "user-1");
  assert.deepEqual(restartedCache.getFamily("family-1"), {
    id: "family-1",
    name: "我的家庭",
  });
  assert.deepEqual(
    restartedCache.read({
      key: "query-api:getDailyHealth:2026-07-31",
      familyId: "family-1",
    }),
    { reminders: [{ id: "reminder-1" }] },
  );

  restartedCache.verifyAccess({
    userId: "user-1",
    families: [],
  });
  assert.equal(restartedCache.getVerifiedUserId(), "user-1");
  assert.equal(restartedCache.getFamily("family-1"), undefined);
  assert.equal(savedValue, undefined);
});
