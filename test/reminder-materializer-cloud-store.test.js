const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCloudReminderMaterializerStore,
} = require("../cloudfunctions/reminder-materializer/src/create-cloud-reminder-materializer-store");

test("调度云存储按稳定提醒 ID 幂等写入一次性提醒集合", async () => {
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
  const store = createCloudReminderMaterializerStore(db);
  const reminder = {
    _id: "reminder-1",
    familyId: "family-1",
    dedupKey: "rule:rule-1:2026-07-31T00:00:00.000Z",
  };

  const result = await store.createReminderIfAbsent(reminder);

  assert.deepEqual(result, {
    outcome: "created",
    reminder,
  });
  assert.deepEqual(savedDocument, reminder);
});
