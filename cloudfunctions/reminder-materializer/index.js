const cloud = require("wx-server-sdk");
const { createHash } = require("node:crypto");

const {
  createReminderMaterializer,
} = require("./src/create-reminder-materializer");
const {
  createCloudReminderMaterializerStore,
} = require("./src/create-cloud-reminder-materializer-store");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
const store = createCloudReminderMaterializerStore(db);
const materializer = createReminderMaterializer({
  store,
  now: () => new Date(),
  createReminderId: ({ dedupKey }) =>
    `reminder-${createHash("sha256")
      .update(dedupKey)
      .digest("hex")
      .slice(0, 32)}`,
});

async function findOne(collectionName, query) {
  const result = await db
    .collection(collectionName)
    .where(query)
    .limit(1)
    .get();
  return result.data[0] ?? null;
}

exports.main = async (event = {}) => {
  if (event.action !== "materialize") {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_ACTION",
        message: "暂不支持这个调度操作",
      },
    };
  }

  try {
    const context = cloud.getWXContext();
    let familyId;

    if (context.SOURCE !== "wx_trigger") {
      familyId = event.data?.familyId;

      if (typeof familyId !== "string" || !familyId) {
        return {
          ok: false,
          error: {
            code: "INVALID_ARGUMENT",
            message: "请选择要调度的家庭",
          },
        };
      }

      const user = await findOne("users", {
        wechatOpenId: context.OPENID,
      });
      const membership = user
        ? await findOne("family_memberships", {
            familyId,
            userId: user._id,
            status: "active",
          })
        : null;

      if (!membership) {
        return {
          ok: false,
          error: {
            code: "MATERIALIZER_ACCESS_DENIED",
            message: "只有当前家庭的有效成员可以手动运行调度",
          },
        };
      }
    }

    return {
      ok: true,
      data: await materializer.materialize({
        familyId,
      }),
    };
  } catch (error) {
    console.error("reminder-materializer failed", error);
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "未来提醒生成失败，请稍后重试",
      },
    };
  }
};
