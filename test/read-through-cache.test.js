const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createReadThroughCache,
} = require("../miniprogram/services/read-through-cache");

test("有效期内重复读取同一资源只执行一次加载", async () => {
  let loadCount = 0;
  const cache = createReadThroughCache({
    ttlMs: 30_000,
    now: () => 1_000,
  });

  const load = async () => {
    loadCount += 1;
    return {
      families: [{ id: "family-1" }],
    };
  };

  const first = await cache.get("family:bootstrap", load);
  const second = await cache.get("family:bootstrap", load);

  assert.deepEqual(second, first);
  assert.equal(loadCount, 1);
});

test("缓存过期后重新加载资源", async () => {
  let currentTime = 1_000;
  let loadCount = 0;
  const cache = createReadThroughCache({
    ttlMs: 30_000,
    now: () => currentTime,
  });
  const load = async () => {
    loadCount += 1;
    return loadCount;
  };

  assert.equal(await cache.get("daily:family-1:2026-07-29", load), 1);
  currentTime += 30_001;
  assert.equal(await cache.get("daily:family-1:2026-07-29", load), 2);
});

test("写操作清空读取缓存并推进修订号", async () => {
  let loadCount = 0;
  const cache = createReadThroughCache({
    ttlMs: 30_000,
    now: () => 1_000,
  });
  const load = async () => {
    loadCount += 1;
    return loadCount;
  };

  assert.equal(await cache.get("records:family-1", load), 1);
  assert.equal(cache.getRevision(), 0);

  cache.clear();

  assert.equal(cache.getRevision(), 1);
  assert.equal(await cache.get("records:family-1", load), 2);
});
