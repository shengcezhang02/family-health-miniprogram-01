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
