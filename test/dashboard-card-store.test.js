const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createDashboardCardStore,
} = require("../miniprogram/services/dashboard-card-store");

function createMemoryStorage() {
  const values = new Map();

  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, structuredClone(value)),
    remove: (key) => values.delete(key),
  };
}

test("同一种卡片可以保存为筛选条件不同的两个实例", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const scope = {
    userId: "user-1",
    familyId: "family-1",
  };

  const first = store.add(scope, {
    type: "record_list",
    title: "我的体温",
    memberIds: ["user-1"],
    templateId: "sys_temperature",
    timeRange: "7d",
  });
  const second = store.add(scope, {
    type: "record_list",
    title: "家人的血压",
    memberIds: ["user-2"],
    templateId: "sys_blood_pressure",
    timeRange: "30d",
  });

  assert.notEqual(first.id, second.id);
  assert.deepEqual(store.load(scope), [first, second]);
});

test("复制卡片会保留配置并生成新的卡片编号", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const scope = {
    userId: "user-1",
    familyId: "family-1",
  };
  const source = store.add(scope, {
    type: "trend",
    title: "体温趋势",
    memberIds: ["user-1", "user-2"],
    templateId: "sys_temperature",
    timeRange: "90d",
    fieldKeys: ["temperature"],
  });

  const copied = store.copy(scope, source.id);

  assert.equal(copied.title, "体温趋势 副本");
  assert.notEqual(copied.id, source.id);
  assert.deepEqual(copied.memberIds, source.memberIds);
  assert.deepEqual(copied.fieldKeys, source.fieldKeys);
  assert.deepEqual(store.load(scope), [source, copied]);
});

test("修改卡片只更新目标实例并保留它在看板中的位置", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const scope = {
    userId: "user-1",
    familyId: "family-1",
  };
  const first = store.add(scope, {
    type: "record_list",
    title: "近期记录",
  });
  const second = store.add(scope, {
    type: "latest_data",
    title: "最新体温",
  });

  const updated = store.update(scope, first.id, {
    title: "最近七天",
    memberIds: ["user-2"],
    timeRange: "7d",
  });

  assert.equal(updated.id, first.id);
  assert.equal(updated.type, "record_list");
  assert.deepEqual(store.load(scope), [updated, second]);
});

test("卡片可以按新的编号顺序重新排列", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const scope = {
    userId: "user-1",
    familyId: "family-1",
  };
  const first = store.add(scope, {
    type: "record_list",
    title: "记录",
  });
  const second = store.add(scope, {
    type: "trend",
    title: "趋势",
  });
  const third = store.add(scope, {
    type: "latest_data",
    title: "最新数据",
  });

  const reordered = store.reorder(scope, [
    third.id,
    first.id,
    second.id,
  ]);

  assert.deepEqual(
    reordered.map((card) => card.id),
    [third.id, first.id, second.id],
  );
  assert.deepEqual(store.load(scope), reordered);
});

test("删除卡片只影响当前账号在当前家庭的看板", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const ownFamily = {
    userId: "user-1",
    familyId: "family-1",
  };
  const otherFamily = {
    userId: "user-1",
    familyId: "family-2",
  };
  const otherAccount = {
    userId: "user-2",
    familyId: "family-1",
  };
  const target = store.add(ownFamily, {
    type: "record_list",
    title: "我的看板",
  });
  store.add(otherFamily, {
    type: "trend",
    title: "另一个家庭",
  });
  store.add(otherAccount, {
    type: "latest_data",
    title: "另一个账号",
  });

  store.remove(ownFamily, target.id);

  assert.deepEqual(store.load(ownFamily), []);
  assert.equal(store.load(otherFamily)[0].title, "另一个家庭");
  assert.equal(store.load(otherAccount)[0].title, "另一个账号");
});

test("首次进入建立近期记录卡片，用户删除后不会再次自动出现", () => {
  const storage = createMemoryStorage();
  let nextId = 1;
  const store = createDashboardCardStore({
    ...storage,
    createId: () => `card-${nextId++}`,
  });
  const scope = {
    userId: "user-1",
    familyId: "family-1",
  };

  const initialCards = store.initialize(scope);

  assert.deepEqual(initialCards, [
    {
      id: "card-1",
      type: "record_list",
      title: "近期记录",
      memberIds: [],
      templateId: "",
      timeRange: "30d",
      fieldKeys: [],
    },
  ]);

  store.remove(scope, initialCards[0].id);

  assert.deepEqual(store.initialize(scope), []);
});
