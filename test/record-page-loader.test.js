const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRecordPageLoader,
} = require("../miniprogram/services/record-page-loader");

test("快速记录深链接先初始化身份，再读取成员和模板", async () => {
  const calls = [];
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => {
      calls.push("bootstrap");
      return {
        families: [
          {
            id: "family-1",
            name: "我们家",
          },
        ],
      };
    },
    listFamilyMembers: async () => {
      calls.push("members");
      return {
        members: [
          {
            id: "user-1",
            displayName: "用户一",
            isSelf: true,
          },
        ],
      };
    },
    listTemplates: async () => {
      calls.push("templates");
      return {
        templates: [{ id: "sys_temperature", name: "体温" }],
      };
    },
  });

  const result = await loader.loadEditor("family-1");

  assert.equal(calls[0], "bootstrap");
  assert.deepEqual(new Set(calls.slice(1)), new Set(["members", "templates"]));
  assert.deepEqual(result, {
    family: {
      id: "family-1",
      name: "我们家",
    },
    members: [
      {
        id: "user-1",
        displayName: "用户一",
        isSelf: true,
        displayLabel: "用户一（我）",
      },
    ],
    templates: [{ id: "sys_temperature", name: "体温" }],
  });
});

test("健康记录 tab 使用恢复出的家庭编号查询数据", async () => {
  const requestedFamilyIds = [];
  const family = {
    id: "family-2",
    name: "外婆家",
  };
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => ({
      families: [family],
    }),
    resolveCurrentFamily: () => family,
    getRecordTimeline: async ({ familyId }) => {
      requestedFamilyIds.push(familyId);
      return {
        items: [],
      };
    },
    listFamilyMembers: async ({ familyId }) => {
      requestedFamilyIds.push(familyId);
      return {
        members: [],
      };
    },
  });

  const result = await loader.loadTimeline("");

  assert.equal(result.family.id, "family-2");
  assert.deepEqual(requestedFamilyIds, ["family-2", "family-2"]);
});
