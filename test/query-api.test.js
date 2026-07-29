const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createQueryApi,
} = require("../cloudfunctions/query-api/src/create-query-api");
const {
  createInMemoryQueryStore,
} = require("./support/create-in-memory-query-store");

function createRecord({
  id,
  familyId = "family-1",
  subjectUserId = "user-1",
  occurredAt,
  deletedAt,
  remark,
}) {
  return {
    _id: id,
    familyId,
    subjectUserId,
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
    values: { temperature: id === "newer" ? 36.8 : 36.5 },
    ...(remark ? { remark } : {}),
    occurredAt: new Date(occurredAt),
    recordSource: "manual",
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    revision: 1,
    createdAt: new Date(occurredAt),
    updatedAt: new Date(occurredAt),
    originRecordId: id,
    ...(deletedAt ? { deletedAt: new Date(deletedAt) } : {}),
  };
}

test("时间线只返回当前家庭未删除记录，并按发生时间倒序排列", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "older",
        occurredAt: "2026-07-29T01:00:00.000Z",
      }),
      createRecord({
        id: "newer",
        occurredAt: "2026-07-29T02:00:00.000Z",
        remark: "饭后",
      }),
      createRecord({
        id: "deleted",
        occurredAt: "2026-07-29T03:00:00.000Z",
        deletedAt: "2026-07-29T03:05:00.000Z",
      }),
      createRecord({
        id: "another-family",
        familyId: "family-2",
        occurredAt: "2026-07-29T04:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
  });

  const result = await api.handle({
    action: "getRecordTimeline",
    requestId: "req-record-timeline",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.items.map((item) => ({
      id: item.id,
      subjectName: item.subject.displayName,
      occurredAt: item.occurredAt,
      remark: item.remark,
    })),
    [
      {
        id: "newer",
        subjectName: "用户一",
        occurredAt: "2026-07-29T02:00:00.000Z",
        remark: "饭后",
      },
      {
        id: "older",
        subjectName: "用户一",
        occurredAt: "2026-07-29T01:00:00.000Z",
        remark: undefined,
      },
    ],
  );
});

test("已删除记录列表只返回当前家庭的软删除记录", async () => {
  const caller = {
    _id: "user-1",
    displayName: "用户一",
  };
  const queryStore = createInMemoryQueryStore({
    users: [caller],
    memberships: [
      {
        familyId: "family-1",
        userId: caller._id,
        status: "active",
      },
    ],
    records: [
      createRecord({
        id: "active",
        occurredAt: "2026-07-29T01:00:00.000Z",
      }),
      createRecord({
        id: "deleted-older",
        occurredAt: "2026-07-29T02:00:00.000Z",
        deletedAt: "2026-07-29T03:00:00.000Z",
      }),
      createRecord({
        id: "deleted-newer",
        occurredAt: "2026-07-29T01:30:00.000Z",
        deletedAt: "2026-07-29T04:00:00.000Z",
      }),
    ],
  });
  const api = createQueryApi({
    getCaller: async () => structuredClone(caller),
    queryStore,
  });

  const result = await api.handle({
    action: "getDeletedRecordTimeline",
    requestId: "req-deleted-record-timeline",
    data: {
      familyId: "family-1",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.items.map((item) => ({
      id: item.id,
      deletedAt: item.deletedAt,
      revision: item.revision,
    })),
    [
      {
        id: "deleted-newer",
        deletedAt: "2026-07-29T04:00:00.000Z",
        revision: 1,
      },
      {
        id: "deleted-older",
        deletedAt: "2026-07-29T03:00:00.000Z",
        revision: 1,
      },
    ],
  );
});
