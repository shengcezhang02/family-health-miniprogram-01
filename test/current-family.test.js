const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCurrentFamilyPreference,
} = require("../miniprogram/services/current-family-preference");

function createMemoryStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
    },
    remove(key) {
      values.delete(key);
    },
  };
}

test("仍然有效时复用本地保存的当前家庭", () => {
  const preference = createCurrentFamilyPreference(
    createMemoryStorage({
      currentFamilyId: "family-2",
    }),
  );
  const families = [
    { id: "family-1", name: "家庭一" },
    { id: "family-2", name: "家庭二" },
  ];

  assert.deepEqual(preference.resolve(families), families[1]);
});

test("本地家庭失效时改用云端返回的第一个有效家庭", () => {
  const storage = createMemoryStorage({
    currentFamilyId: "inactive-family",
  });
  const preference = createCurrentFamilyPreference(storage);
  const families = [{ id: "active-family", name: "有效家庭" }];

  assert.deepEqual(preference.resolve(families), families[0]);
  assert.equal(storage.get("currentFamilyId"), "active-family");
});

test("没有有效家庭时清除本地家庭 ID", () => {
  const storage = createMemoryStorage({
    currentFamilyId: "inactive-family",
  });
  const preference = createCurrentFamilyPreference(storage);

  assert.equal(preference.resolve([]), null);
  assert.equal(storage.get("currentFamilyId"), undefined);
});
