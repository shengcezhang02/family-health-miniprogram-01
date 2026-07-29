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
