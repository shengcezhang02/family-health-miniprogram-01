const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createTemplateApi,
} = require("../cloudfunctions/template-api/src/create-template-api");

function createTemplateApiFor({
  callerUserId = "user-1",
  membership = {
    familyId: "family-1",
    userId: "user-1",
    status: "active",
  },
} = {}) {
  return createTemplateApi({
    getCaller: async () => ({ _id: callerUserId }),
    templateStore: {
      async getActiveMembership(familyId, userId) {
        return membership?.familyId === familyId &&
          membership?.userId === userId &&
          membership?.status === "active"
          ? structuredClone(membership)
          : null;
      },
    },
  });
}

test("有效家庭成员可以读取四个系统模板", async () => {
  const api = createTemplateApiFor();

  const result = await api.handle({
    action: "listTemplates",
    requestId: "req-list-system-templates",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.templates.map(({ id, name }) => ({ id, name })),
    [
      { id: "sys_temperature", name: "体温" },
      { id: "sys_blood_pressure", name: "血压" },
      { id: "sys_blood_glucose", name: "血糖" },
      { id: "sys_medication", name: "用药" },
    ],
  );
  assert.deepEqual(result.data.templates[0].fields, [
    {
      key: "temperature",
      label: "体温",
      type: "number",
      unit: "℃",
      required: true,
      sortOrder: 10,
    },
  ]);
});
