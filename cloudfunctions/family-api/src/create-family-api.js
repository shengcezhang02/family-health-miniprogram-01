class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function toUserSummary(user) {
  return {
    id: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function toFamilySummary({ family, membership }) {
  return {
    id: family._id,
    name: family.name,
    role: membership.role,
  };
}

function createFamilyApi({
  getCallerIdentity,
  familyStore,
  createId,
  now,
  reportError = () => {},
} = {}) {
  async function getOrCreateCaller() {
    const identity = await getCallerIdentity();

    if (!identity?.openId) {
      throw new ApiError(
        "UNAUTHENTICATED",
        "无法确认微信身份，请重新进入小程序",
      );
    }

    let user = await familyStore.getUserByOpenId(identity.openId);

    if (!user) {
      const timestamp = now();
      user = await familyStore.createUser({
        _id: createId(),
        wechatOpenId: identity.openId,
        displayName: "微信用户",
        avatarUrl: null,
        notificationPreferences: {},
        securityState: {},
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    return user;
  }

  async function listFamilies(userId) {
    const families = await familyStore.listActiveFamiliesByUserId(userId);
    return families.map(toFamilySummary);
  }

  async function createSpace(user, name) {
    const timestamp = now();
    const family = {
      _id: createId(),
      name,
      createdByUserId: user._id,
      systemTemplateSettings: [],
      storageQuotaBytes: 100 * 1024 * 1024,
      storageUsedBytes: 0,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const membership = {
      _id: createId(),
      familyId: family._id,
      userId: user._id,
      role: "admin",
      status: "active",
      profileManagementAllowed: false,
      joinedAt: timestamp,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await familyStore.createFamilyWithAdmin({
      family,
      membership,
    });

    return toFamilySummary({ family, membership });
  }

  const actions = {
    async bootstrap() {
      const user = await getOrCreateCaller();

      return {
        authenticated: true,
        user: toUserSummary(user),
        families: await listFamilies(user._id),
      };
    },

    async createFamily(data) {
      const name = data.name?.trim();

      if (!name) {
        throw new ApiError("INVALID_ARGUMENT", "请填写家庭名称");
      }

      if (name.length > 40) {
        throw new ApiError("INVALID_ARGUMENT", "家庭名称最多 40 个字");
      }

      const user = await getOrCreateCaller();
      return {
        family: await createSpace(user, name),
      };
    },

    async createPersonalSpace() {
      const user = await getOrCreateCaller();
      return {
        family: await createSpace(user, "我的健康"),
      };
    },

    async listMyFamilies() {
      const user = await getOrCreateCaller();
      return {
        families: await listFamilies(user._id),
      };
    },
  };

  return {
    async handle(request) {
      const action = actions[request.action];

      if (action) {
        try {
          const data = await action(request.data ?? {});

          return {
            ok: true,
            requestId: request.requestId,
            data,
          };
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              requestId: request.requestId,
              error: {
                code: error.code,
                message: error.message,
              },
            };
          }

          reportError(error);

          return {
            ok: false,
            requestId: request.requestId,
            error: {
              code: "INTERNAL_ERROR",
              message: "服务暂时不可用，请稍后重试",
            },
          };
        }
      }

      return {
        ok: false,
        requestId: request.requestId,
        error: {
          code: "UNSUPPORTED_ACTION",
          message: "暂不支持这个操作",
        },
      };
    },
  };
}

module.exports = {
  createFamilyApi,
};
