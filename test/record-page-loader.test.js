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

test("编辑表单把身份、成员和模板合并为同一轮并行请求", async () => {
  const calls = [];
  let releaseBootstrap;
  const bootstrapPromise = new Promise((resolve) => {
    releaseBootstrap = resolve;
  });
  const loader = createRecordPageLoader({
    bootstrapFamily: () => {
      calls.push("bootstrap");
      return bootstrapPromise;
    },
    listFamilyMembers: async () => {
      calls.push("members");
      return { members: [] };
    },
    listTemplates: async () => {
      calls.push("templates");
      return { templates: [] };
    },
  });

  const resultPromise = loader.loadEditor("family-1");
  await Promise.resolve();
  assert.deepEqual(calls, [
    "bootstrap",
    "members",
    "templates",
  ]);

  releaseBootstrap({
    families: [{ id: "family-1", name: "我们家" }],
  });
  await resultPromise;
});

test("修改提醒时事项详情也和表单基础数据并行加载", async () => {
  const calls = [];
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => {
      calls.push("bootstrap");
      return {
        families: [{ id: "family-1", name: "我们家" }],
      };
    },
    listFamilyMembers: async () => {
      calls.push("members");
      return { members: [] };
    },
    listTemplates: async () => {
      calls.push("templates");
      return { templates: [] };
    },
  });

  const result = await loader.loadEditor("family-1", {
    loadExistingItem: async () => {
      calls.push("item");
      return { reminder: { id: "reminder-1" } };
    },
  });

  assert.deepEqual(
    new Set(calls),
    new Set(["bootstrap", "members", "templates", "item"]),
  );
  assert.deepEqual(result.existingItemResult, {
    reminder: { id: "reminder-1" },
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

test("健康记录在家庭校验后先交付本地快照再刷新", async () => {
  const family = {
    id: "family-1",
    name: "我们家",
  };
  const snapshots = [];
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => ({
      families: [family],
    }),
    resolveCurrentFamily: () => family,
    getCachedRecordTimeline: () => ({
      items: [{ id: "cached-record" }],
    }),
    getCachedFamilyMembers: () => ({
      members: [
        {
          id: "user-1",
          displayName: "用户一",
          isSelf: true,
        },
      ],
    }),
    getRecordTimeline: async () => ({
      items: [{ id: "fresh-record" }],
    }),
    listFamilyMembers: async () => ({
      members: [
        {
          id: "user-1",
          displayName: "用户一",
          isSelf: true,
        },
      ],
    }),
  });

  const result = await loader.loadTimeline("", {
    onCached(snapshot) {
      snapshots.push(snapshot);
    },
  });

  assert.equal(snapshots[0].items[0].id, "cached-record");
  assert.equal(
    snapshots[0].members[0].displayLabel,
    "用户一（我）",
  );
  assert.equal(result.items[0].id, "fresh-record");
});

test("应用重启时可在请求云端前读取上次已验证的记录快照", () => {
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => {
      throw new Error("此时不应请求云端");
    },
    resolveCurrentFamily: () => undefined,
    listFamilyMembers: async () => undefined,
    listTemplates: async () => undefined,
    getRecordTimeline: async () => undefined,
    peekCurrentFamilyId: () => "family-1",
    getCachedFamily: () => ({
      id: "family-1",
      name: "我们家",
    }),
    getCachedRecordTimeline: () => ({
      items: [{ id: "cached-record" }],
    }),
    getCachedFamilyMembers: () => ({
      members: [
        {
          id: "user-1",
          displayName: "用户一",
          isSelf: true,
        },
      ],
    }),
  });

  assert.deepEqual(loader.getStartupSnapshot(), {
    family: {
      id: "family-1",
      name: "我们家",
    },
    items: [{ id: "cached-record" }],
    members: [
      {
        id: "user-1",
        displayName: "用户一",
        isSelf: true,
        displayLabel: "用户一（我）",
      },
    ],
  });
});

test("应用重启时新建表单可立即复用已验证的成员和模板", () => {
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => undefined,
    resolveCurrentFamily: () => undefined,
    listFamilyMembers: async () => undefined,
    listTemplates: async () => undefined,
    getRecordTimeline: async () => undefined,
    getCachedFamily: () => ({
      id: "family-1",
      name: "我们家",
    }),
    getCachedFamilyMembers: () => ({
      members: [
        {
          id: "user-1",
          displayName: "用户一",
          isSelf: true,
        },
      ],
    }),
    getCachedTemplates: () => ({
      templates: [
        {
          id: "sys_temperature",
          name: "体温",
          fields: [],
        },
      ],
    }),
  });

  assert.deepEqual(
    loader.getEditorStartupSnapshot("family-1"),
    {
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
      templates: [
        {
          id: "sys_temperature",
          name: "体温",
          fields: [],
        },
      ],
    },
  );
});

test("健康记录看板在确认家庭后并行读取看板数据和模板", async () => {
  const calls = [];
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => ({
      user: { id: "user-1" },
      families: [{ id: "family-1", name: "我们家" }],
    }),
    resolveCurrentFamily: (families) => families[0],
    getDashboardData: async ({ familyId }) => {
      calls.push(`dashboard:${familyId}`);
      return {
        members: [
          {
            id: "user-1",
            displayName: "用户一",
            isSelf: true,
          },
        ],
        records: [{ id: "record-1" }],
        reminders: [],
        recurringRules: [],
      };
    },
    listTemplates: async ({ familyId }) => {
      calls.push(`templates:${familyId}`);
      return {
        templates: [{ id: "sys_temperature", name: "体温" }],
      };
    },
  });

  const result = await loader.loadDashboard("");

  assert.deepEqual(new Set(calls), new Set([
    "dashboard:family-1",
    "templates:family-1",
  ]));
  assert.equal(result.userId, "user-1");
  assert.equal(result.family.id, "family-1");
  assert.equal(result.members[0].displayLabel, "用户一（我）");
  assert.equal(result.records[0].id, "record-1");
  assert.equal(result.templates[0].name, "体温");
});

test("应用重启时健康记录看板可先使用账号与家庭都已验证的快照", () => {
  const loader = createRecordPageLoader({
    bootstrapFamily: async () => undefined,
    listTemplates: async () => undefined,
    getDashboardData: async () => undefined,
    resolveCurrentFamily: () => undefined,
    peekCurrentFamilyId: () => "family-1",
    getCachedUserId: () => "user-1",
    getCachedFamily: () => ({
      id: "family-1",
      name: "我们家",
    }),
    getCachedDashboardData: () => ({
      members: [
        {
          id: "user-1",
          displayName: "用户一",
          isSelf: true,
        },
      ],
      records: [{ id: "cached-record" }],
      reminders: [],
      recurringRules: [],
    }),
    getCachedTemplates: () => ({
      templates: [{ id: "sys_temperature", name: "体温" }],
    }),
  });

  const snapshot = loader.getDashboardStartupSnapshot();

  assert.equal(snapshot.userId, "user-1");
  assert.equal(snapshot.family.id, "family-1");
  assert.equal(snapshot.members[0].displayLabel, "用户一（我）");
  assert.equal(snapshot.records[0].id, "cached-record");
  assert.equal(snapshot.templates[0].name, "体温");
});
