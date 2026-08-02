const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCloudHealthItemStore,
} = require("../cloudfunctions/health-item-api/src/create-cloud-health-item-store");

test("新记录事务使用条件查询确认不存在，再写入固定文档 ID", async () => {
  let savedDocument = null;
  const db = {
    collection() {
      return {};
    },

    async runTransaction(handler) {
      return handler({
        collection(name) {
          assert.equal(name, "health_records");

          return {
            where(query) {
              assert.deepEqual(query, {
                _id: "record-1",
              });
              return {
                limit(limit) {
                  assert.equal(limit, 1);
                  return {
                    async get() {
                      return {
                        data: [],
                      };
                    },
                  };
                },
              };
            },

            doc(recordId) {
              assert.equal(recordId, "record-1");
              return {
                async get() {
                  throw new Error(
                    "事务内直接读取不存在的文档会失败",
                  );
                },
                async set({ data }) {
                  savedDocument = {
                    _id: recordId,
                    ...data,
                  };
                },
              };
            },
          };
        },
      });
    },
  };
  const store = createCloudHealthItemStore(db);
  const record = {
    _id: "record-1",
    familyId: "family-1",
    originRecordId: "record-1",
  };

  const result = await store.createRecord(record);

  assert.deepEqual(result, {
    outcome: "created",
    record,
  });
  assert.deepEqual(savedDocument, record);
});

test("新提醒事务使用固定文档 ID 保存到独立集合", async () => {
  let savedDocument = null;
  const db = {
    collection() {
      return {};
    },

    async runTransaction(handler) {
      return handler({
        collection(name) {
          assert.equal(name, "one_time_reminders");

          return {
            where(query) {
              assert.deepEqual(query, {
                _id: "reminder-1",
              });
              return {
                limit(limit) {
                  assert.equal(limit, 1);
                  return {
                    async get() {
                      return {
                        data: [],
                      };
                    },
                  };
                },
              };
            },

            doc(reminderId) {
              assert.equal(reminderId, "reminder-1");
              return {
                async set({ data }) {
                  savedDocument = {
                    _id: reminderId,
                    ...data,
                  };
                },
              };
            },
          };
        },
      });
    },
  };
  const store = createCloudHealthItemStore(db);
  const reminder = {
    _id: "reminder-1",
    familyId: "family-1",
    dedupKey: "item:reminder-1",
  };

  const result = await store.createReminder(reminder);

  assert.deepEqual(result, {
    outcome: "created",
    reminder,
  });
  assert.deepEqual(savedDocument, reminder);
});

test("新周期规则事务使用固定文档 ID 保存到独立集合", async () => {
  let savedDocument = null;
  const db = {
    collection() {
      return {};
    },

    async runTransaction(handler) {
      return handler({
        collection(name) {
          assert.equal(name, "recurring_rules");

          return {
            where(query) {
              assert.deepEqual(query, {
                _id: "rule-1",
              });
              return {
                limit(limit) {
                  assert.equal(limit, 1);
                  return {
                    async get() {
                      return {
                        data: [],
                      };
                    },
                  };
                },
              };
            },

            doc(ruleId) {
              assert.equal(ruleId, "rule-1");
              return {
                async set({ data }) {
                  savedDocument = {
                    _id: ruleId,
                    ...data,
                  };
                },
              };
            },
          };
        },
      });
    },
  };
  const store = createCloudHealthItemStore(db);
  const rule = {
    _id: "rule-1",
    familyId: "family-1",
    status: "active",
  };

  const result = await store.createRecurringRule(rule);

  assert.deepEqual(result, {
    outcome: "created",
    rule,
  });
  assert.deepEqual(savedDocument, rule);
});

test("提醒打卡事务同时保存关联记录并完成提醒", async () => {
  const saved = new Map();
  const pendingReminder = {
    _id: "reminder-1",
    familyId: "family-1",
    subjectUserId: "user-1",
    status: "pending",
    revision: 1,
  };
  const db = {
    collection() {
      return {};
    },

    async runTransaction(handler) {
      return handler({
        collection(name) {
          return {
            where(query) {
              return {
                limit() {
                  return {
                    async get() {
                      if (name === "family_memberships") {
                        return {
                          data:
                            query.familyId === "family-1" &&
                            query.status === "active" &&
                            ["user-1", "user-2"].includes(query.userId)
                              ? [{ _id: `membership-${query.userId}` }]
                              : [],
                        };
                      }

                      if (name === "one_time_reminders") {
                        return {
                          data:
                            query._id === pendingReminder._id &&
                            query.familyId === pendingReminder.familyId
                              ? [pendingReminder]
                              : [],
                        };
                      }

                      if (name === "health_records") {
                        return {
                          data: [],
                        };
                      }

                      throw new Error(`unexpected collection: ${name}`);
                    },
                  };
                },
              };
            },

            doc(id) {
              return {
                async set({ data }) {
                  saved.set(`${name}/${id}`, {
                    _id: id,
                    ...data,
                  });
                },
              };
            },
          };
        },
      });
    },
  };
  const store = createCloudHealthItemStore(db);
  const completedAt = new Date("2026-07-29T02:00:00.000Z");
  const record = {
    _id: "record-for-reminder-1",
    familyId: "family-1",
    sourceReminderId: "reminder-1",
  };

  const result = await store.checkInReminder({
    reminderId: "reminder-1",
    familyId: "family-1",
    expectedRevision: 1,
    record,
    updatedByUserId: "user-2",
    completedAt,
  });

  assert.equal(result.outcome, "completed");
  assert.deepEqual(result.record, record);
  assert.equal(result.reminder.status, "completed");
  assert.equal(result.reminder.linkedRecordId, record._id);
  assert.deepEqual(
    saved.get("health_records/record-for-reminder-1"),
    record,
  );
  assert.deepEqual(
    saved.get("one_time_reminders/reminder-1"),
    result.reminder,
  );
});
