const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCareShareApi,
} = require("../cloudfunctions/share-api/src/create-care-share-api");
const {
  createInMemoryCareShareStore,
} = require("./support/create-in-memory-care-share-store");
const {
  getSystemTemplate,
} = require("../cloudfunctions/health-item-api/src/system-templates");

function createFixture() {
  const caller = {
    _id: "user-sender",
    wechatOpenId: "openid-sender",
    displayName: "小林",
  };
  const subject = {
    _id: "user-subject",
    wechatOpenId: "openid-subject",
    displayName: "妈妈",
  };
  const reminder = {
    _id: "reminder-temperature",
    familyId: "family-1",
    subjectUserId: subject._id,
    sourceTemplateType: "system",
    sourceTemplateId: "sys_temperature",
    templateNameSnapshot: "体温",
    fieldSchemaSnapshot: [
      {
        key: "temperature",
        label: "体温",
        type: "number",
        unit: "℃",
        required: true,
        sortOrder: 10,
      },
    ],
    values: {},
    remark: "睡前量一下",
    plannedAt: new Date("2026-08-02T12:00:00.000Z"),
    notificationTimes: [],
    status: "pending",
    revision: 1,
  };
  const careShareStore = createInMemoryCareShareStore({
    users: [caller, subject],
    families: [
      {
        _id: "family-1",
        name: "林家",
      },
    ],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
      {
        familyId: "family-1",
        userId: subject._id,
        status: "active",
      },
    ],
    reminders: [reminder],
  });
  const api = createCareShareApi({
    getCaller: async () => structuredClone(caller),
    careShareStore,
    createCredentials: () => ({
      token: "care-share-original-token",
      tokenHash: "care-share-token-digest",
    }),
    createShareId: () => "care-share-1",
    createReminderId: () => "reminder-care-share-1",
    hashToken: () => "care-share-token-digest",
    getSystemTemplate,
    now: () => new Date("2026-08-02T10:00:00.000Z"),
  });

  return {
    api,
    careShareStore,
    reminder,
  };
}

test("有效家庭成员可以分享现有未打卡提醒且数据库不保存原始令牌", async () => {
  const { api, careShareStore, reminder } = createFixture();

  const result = await api.handle({
    action: "createCareShare",
    requestId: "req-share-temperature",
    data: {
      source: {
        type: "reminder",
        reminderId: reminder._id,
      },
      cardStyleCode: "warm-green",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.share.token, "care-share-original-token");
  assert.equal(
    result.data.share.path,
    "/pages/care-share/care-share?token=care-share-original-token",
  );
  assert.deepEqual(result.data.share.displaySnapshot, {
    familyName: "林家",
    subjectDisplayName: "妈妈",
    templateName: "体温",
  });
  assert.deepEqual(careShareStore.inspectCareShares(), [
    {
      _id: "care-share-1",
      familyId: "family-1",
      reminderId: reminder._id,
      subjectUserId: "user-subject",
      senderUserId: "user-sender",
      tokenHash: "care-share-token-digest",
      cardStyleCode: "warm-green",
      displaySnapshot: {
        familyName: "林家",
        subjectDisplayName: "妈妈",
        templateName: "体温",
      },
      sentAt: new Date("2026-08-02T10:00:00.000Z"),
      expiresAt: new Date("2026-08-09T10:00:00.000Z"),
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
    },
  ]);
  assert.deepEqual(careShareStore.inspectReminders(), [reminder]);
});

test("快速分享会原子创建一条立即填写的一次性提醒", async () => {
  const { api, careShareStore } = createFixture();

  const result = await api.handle({
    action: "createCareShare",
    requestId: "req-immediate-care-share",
    data: {
      source: {
        type: "immediate",
        familyId: "family-1",
        subjectUserId: "user-subject",
        sourceTemplateType: "system",
        sourceTemplateId: "sys_temperature",
        remark: "现在量一下体温吧",
      },
      cardStyleCode: "sunset",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.share.token, "care-share-original-token");
  assert.equal(careShareStore.inspectCareShares()[0].reminderId, "reminder-care-share-1");
  assert.deepEqual(
    careShareStore
      .inspectReminders()
      .filter((reminder) => reminder._id === "reminder-care-share-1"),
    [
    {
      _id: "reminder-care-share-1",
      familyId: "family-1",
      subjectUserId: "user-subject",
      sourceTemplateType: "system",
      sourceTemplateId: "sys_temperature",
      templateNameSnapshot: "体温",
      fieldSchemaSnapshot: [
        {
          key: "temperature",
          label: "体温",
          type: "number",
          unit: "℃",
          required: true,
          sortOrder: 10,
        },
      ],
      values: {},
      remark: "现在量一下体温吧",
      plannedAt: new Date("2026-08-02T10:00:00.000Z"),
      notificationTimes: [],
      notificationAttemptCount: 0,
      status: "pending",
      creationSource: "care_share",
      dedupKey: "item:reminder-care-share-1",
      createdByUserId: "user-sender",
      updatedByUserId: "user-sender",
      revision: 1,
      createdAt: new Date("2026-08-02T10:00:00.000Z"),
      updatedAt: new Date("2026-08-02T10:00:00.000Z"),
    },
    ],
  );
});

test("家庭有效成员打开分享令牌后直接得到受控填写表单", async () => {
  const { api } = createFixture();
  const created = await api.handle({
    action: "createCareShare",
    requestId: "req-share-temperature",
    data: {
      source: {
        type: "reminder",
        reminderId: "reminder-temperature",
      },
      cardStyleCode: "warm-green",
    },
  });

  const result = await api.handle({
    action: "resolveCareShare",
    requestId: "req-resolve-temperature",
    data: {
      token: created.data.share.token,
    },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-resolve-temperature",
    data: {
      share: {
        status: "ready",
        cardStyleCode: "warm-green",
        displaySnapshot: {
          familyName: "林家",
          subjectDisplayName: "妈妈",
          templateName: "体温",
        },
        sentAt: "2026-08-02T10:00:00.000Z",
        expiresAt: "2026-08-09T10:00:00.000Z",
        form: {
          fields: [
            {
              key: "temperature",
              label: "体温",
              type: "number",
              unit: "℃",
              required: true,
              sortOrder: 10,
            },
          ],
          values: {},
          remark: "睡前量一下",
          plannedAt: "2026-08-02T12:00:00.000Z",
        },
      },
    },
  });
  assert.equal(JSON.stringify(result).includes("family-1"), false);
  assert.equal(JSON.stringify(result).includes("reminder-temperature"), false);
});
