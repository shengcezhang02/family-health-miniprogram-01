const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createCloudProfileStore,
} = require("../cloudfunctions/profile-api/src/create-cloud-profile-store");

function createSerializedTransactionDatabase() {
  const memberships = [
    {
      _id: "caller-membership",
      familyId: "family-1",
      userId: "caller-user",
      status: "active",
      profileManagementAllowed: true,
    },
    {
      _id: "owner-membership",
      familyId: "family-1",
      userId: "owner-user",
      status: "active",
      profileManagementAllowed: false,
    },
  ];
  let operationInProgress = false;

  function createCollection(name) {
    return {
      where(query) {
        return {
          limit() {
            return {
              async get() {
                if (operationInProgress) {
                  throw new Error(
                    "CloudBase transaction operations must be serialized",
                  );
                }

                operationInProgress = true;
                await new Promise((resolve) => setImmediate(resolve));
                operationInProgress = false;

                return {
                  data:
                    name === "family_memberships"
                      ? memberships.filter((membership) =>
                          Object.entries(query).every(
                            ([key, value]) =>
                              membership[key] === value,
                          ),
                        )
                      : [],
                };
              },
            };
          },
        };
      },
    };
  }

  return {
    collection: createCollection,
    runTransaction(handler) {
      return handler({
        collection: createCollection,
      });
    },
  };
}

test("真实事务限制下，关闭代管后管理员保存会被正常拒绝", async () => {
  const store = createCloudProfileStore(
    createSerializedTransactionDatabase(),
  );

  const result = await store.saveManagedProfile({
    familyId: "family-1",
    callerUserId: "caller-user",
    ownerUserId: "owner-user",
    profileId: "new-profile",
    expectedRevision: 3,
    values: {
      diabetesStatus: "uncertain",
      hypertensionStatus: "uncertain",
    },
    timestamp: new Date("2026-07-29T00:00:00.000Z"),
  });

  assert.deepEqual(result, {
    outcome: "permission-denied",
  });
});
