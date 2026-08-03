const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCloudCareShareStore,
} = require("../cloudfunctions/share-api/src/create-cloud-care-share-store");
const {
  createInMemoryCloudDatabase,
} = require("./support/create-in-memory-cloud-database");

test("立即关心分享在同一事务写入提醒和分享凭据摘要", async () => {
  const db = createInMemoryCloudDatabase({
    family_memberships: [
      {
        _id: "membership-sender",
        familyId: "family-1",
        userId: "user-sender",
        status: "active",
      },
      {
        _id: "membership-subject",
        familyId: "family-1",
        userId: "user-subject",
        status: "active",
      },
    ],
  });
  const store = createCloudCareShareStore(db);
  const reminder = {
    _id: "reminder-1",
    familyId: "family-1",
    subjectUserId: "user-subject",
    status: "pending",
  };
  const share = {
    _id: "share-1",
    familyId: "family-1",
    reminderId: reminder._id,
    subjectUserId: "user-subject",
    senderUserId: "user-sender",
    tokenHash: "digest-only",
  };

  const result = await store.createImmediateCareShare({
    reminder,
    share,
  });

  assert.equal(result.outcome, "created");
  assert.deepEqual(db.read("one_time_reminders", reminder._id), reminder);
  assert.deepEqual(db.read("care_shares", share._id), share);
  assert.equal(
    Object.hasOwn(db.read("care_shares", share._id), "token"),
    false,
  );
});

test("事务提交前成员失效时不会留下孤立提醒或分享", async () => {
  const db = createInMemoryCloudDatabase({
    family_memberships: [
      {
        _id: "membership-sender",
        familyId: "family-1",
        userId: "user-sender",
        status: "active",
      },
    ],
  });
  const store = createCloudCareShareStore(db);

  const result = await store.createImmediateCareShare({
    reminder: {
      _id: "reminder-1",
      familyId: "family-1",
      subjectUserId: "user-subject",
    },
    share: {
      _id: "share-1",
      familyId: "family-1",
      reminderId: "reminder-1",
      subjectUserId: "user-subject",
      senderUserId: "user-sender",
      tokenHash: "digest-only",
    },
  });

  assert.deepEqual(result, { outcome: "permission-denied" });
  assert.deepEqual(db.list("one_time_reminders"), []);
  assert.deepEqual(db.list("care_shares"), []);
});

test("同一分享请求并发重试时 sentAt 只由首个事务写入", async () => {
  const db = createInMemoryCloudDatabase();
  const store = createCloudCareShareStore(db);
  const baseShare = {
    _id: "share-stable",
    familyId: "family-1",
    reminderId: "reminder-1",
    subjectUserId: "user-subject",
    senderUserId: "user-sender",
    tokenHash: "digest-only",
  };
  const firstSentAt = new Date("2026-08-02T10:00:00.000Z");
  const laterSentAt = new Date("2026-08-02T10:00:10.000Z");

  const [first, replay] = await Promise.all([
    store.createCareShare({ ...baseShare, sentAt: firstSentAt }),
    store.createCareShare({ ...baseShare, sentAt: laterSentAt }),
  ]);

  assert.deepEqual(
    new Set([first.outcome, replay.outcome]),
    new Set(["created", "replayed"]),
  );
  assert.deepEqual(
    db.read("care_shares", baseShare._id).sentAt,
    firstSentAt,
  );
});
