const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createProfilePageLoader,
} = require("../miniprogram/services/profile-page-loader");

test("健康档案深链接会先初始化身份，再读取家庭成员", async () => {
  const calls = [];
  const loader = createProfilePageLoader({
    bootstrapFamily: async () => {
      calls.push("bootstrap");
      return {
        families: [
          {
            id: "family-1",
            name: "测试家庭 A",
            role: "member",
          },
        ],
      };
    },
    listFamilyMembers: async ({ familyId }) => {
      calls.push(`members:${familyId}`);
      return {
        members: [
          {
            userId: "user-1",
            displayName: "成员一",
            isSelf: true,
          },
        ],
      };
    },
  });

  const result = await loader.load("family-1");

  assert.deepEqual(calls, ["bootstrap", "members:family-1"]);
  assert.deepEqual(result, {
    family: {
      id: "family-1",
      name: "测试家庭 A",
      role: "member",
    },
    members: [
      {
        userId: "user-1",
        displayName: "成员一",
        isSelf: true,
      },
    ],
  });
});

test("未加入目标家庭时停止读取档案并给出明确提示", async () => {
  let listedMembers = false;
  const loader = createProfilePageLoader({
    bootstrapFamily: async () => ({
      families: [
        {
          id: "another-family",
          name: "另一个家庭",
          role: "member",
        },
      ],
    }),
    listFamilyMembers: async () => {
      listedMembers = true;
      return { members: [] };
    },
  });

  await assert.rejects(
    () => loader.load("family-1"),
    (error) => {
      assert.equal(error.code, "FAMILY_ACCESS_DENIED");
      assert.equal(
        error.message,
        "当前微信账号尚未加入这个家庭，请先返回首页创建或加入家庭"
      );
      return true;
    }
  );
  assert.equal(listedMembers, false);
});
