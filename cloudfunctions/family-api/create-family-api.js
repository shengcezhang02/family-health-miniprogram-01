class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const EXTERNAL_ACCESS_NOTICE_VERSION =
  "experimental_full_family_health_v1";

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
  createInviteCredentials,
  hashInviteToken,
  hashInviteShortCode,
  reportError = () => {},
} = {}) {
  function createInviteQuery(data) {
    if (data.token) {
      return {
        tokenHash: hashInviteToken(data.token),
      };
    }

    if (data.shortCode) {
      return {
        shortCodeHash: hashInviteShortCode(data.shortCode),
      };
    }

    return null;
  }

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

    async updateMyDisplayName(data) {
      const displayName = data.displayName?.trim();

      if (!displayName) {
        throw new ApiError("INVALID_ARGUMENT", "请填写你的名字");
      }

      if (displayName.length > 20) {
        throw new ApiError("INVALID_ARGUMENT", "名字最多 20 个字");
      }

      const user = await getOrCreateCaller();
      const updatedUser = await familyStore.updateUserDisplayName({
        userId: user._id,
        displayName,
        timestamp: now(),
      });

      return {
        user: toUserSummary(updatedUser),
      };
    },

    async createInvite(data) {
      if (!data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择要邀请家人加入的家庭");
      }

      const user = await getOrCreateCaller();
      const membership = await familyStore.getActiveMembership(
        data.familyId,
        user._id,
      );

      if (membership?.role !== "admin") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以创建邀请",
        );
      }

      const timestamp = now();
      const credentials = createInviteCredentials();
      const invite = {
        _id: createId(),
        familyId: data.familyId,
        createdByUserId: user._id,
        tokenHash: credentials.tokenHash,
        shortCodeHash: credentials.shortCodeHash,
        status: "active",
        expiresAt: new Date(timestamp.getTime() + 7 * 24 * 60 * 60 * 1000),
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await familyStore.createInvite(invite);

      return {
        invite: {
          id: invite._id,
          token: credentials.token,
          shortCode: credentials.shortCode,
          expiresAt: invite.expiresAt.toISOString(),
        },
      };
    },

    async resolveInvite(data) {
      const inviteQuery = createInviteQuery(data);
      const invite = inviteQuery
        ? await familyStore.getInviteByCredential(inviteQuery)
        : null;
      const timestamp = now();

      if (
        !invite ||
        invite.status !== "active" ||
        invite.expiresAt.getTime() <= timestamp.getTime()
      ) {
        throw new ApiError(
          "INVITE_UNAVAILABLE",
          "邀请无效或已失效",
        );
      }

      const [family, creator] = await Promise.all([
        familyStore.getFamilyById(invite.familyId),
        familyStore.getUserById(invite.createdByUserId),
      ]);

      if (!family || !creator) {
        throw new ApiError(
          "INVITE_UNAVAILABLE",
          "邀请无效或已失效",
        );
      }

      return {
        invite: {
          familyName: family.name,
          invitedByDisplayName: creator.displayName,
          expiresAt: invite.expiresAt.toISOString(),
        },
      };
    },

    async joinFamily(data) {
      if (
        (!data.token && !data.shortCode) ||
        typeof data.profileManagementAllowed !== "boolean"
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请明确选择是否允许家庭成员代管档案",
        );
      }

      if (data.externalAccessAcknowledged !== true) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请先确认你已了解家庭外部 AI 访问权限",
        );
      }

      const displayName = data.displayName?.trim();

      if (data.displayName !== undefined && !displayName) {
        throw new ApiError("INVALID_ARGUMENT", "请填写你的名字");
      }

      if (displayName && displayName.length > 20) {
        throw new ApiError("INVALID_ARGUMENT", "名字最多 20 个字");
      }

      const user = await getOrCreateCaller();
      const timestamp = now();
      const result = await familyStore.joinFamilyWithInvite({
        inviteQuery: createInviteQuery(data),
        userId: user._id,
        profileManagementAllowed: data.profileManagementAllowed,
        externalAccessNoticeVersion:
          EXTERNAL_ACCESS_NOTICE_VERSION,
        displayName,
        membershipId: createId(),
        timestamp,
      });

      if (!result) {
        throw new ApiError(
          "INVITE_UNAVAILABLE",
          "邀请无效或已失效",
        );
      }

      if (result.outcome === "already-member") {
        throw new ApiError(
          "ALREADY_MEMBER",
          "你已经是这个家庭的成员",
        );
      }

      return {
        family: toFamilySummary(result),
        ...(displayName
          ? { user: toUserSummary(result.user || user) }
          : {}),
        profileManagementAllowed:
          result.membership.profileManagementAllowed,
      };
    },

    async revokeInvite(data) {
      if (!data.inviteId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择要撤销的邀请");
      }

      const user = await getOrCreateCaller();
      const result = await familyStore.revokeInviteAsAdmin({
        inviteId: data.inviteId,
        userId: user._id,
        timestamp: now(),
      });

      if (result.outcome === "admin-required") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以撤销邀请",
        );
      }

      if (result.outcome !== "revoked") {
        throw new ApiError(
          "INVITE_UNAVAILABLE",
          "邀请无效或已失效",
        );
      }

      return {
        invite: {
          id: result.invite._id,
          status: result.invite.status,
        },
      };
    },

    async promoteMemberToAdmin(data) {
      if (!data.familyId || !data.targetUserId) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择要提升的家庭成员",
        );
      }

      const user = await getOrCreateCaller();
      const result = await familyStore.promoteMemberToAdmin({
        familyId: data.familyId,
        callerUserId: user._id,
        targetUserId: data.targetUserId,
        timestamp: now(),
      });

      if (result.outcome === "admin-required") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以提升成员",
        );
      }

      if (result.outcome !== "updated") {
        throw new ApiError(
          "MEMBER_NOT_FOUND",
          "该成员已不在当前家庭",
        );
      }

      return {
        member: {
          id: result.membership.userId,
          role: result.membership.role,
        },
      };
    },

    async demoteSelfFromAdmin(data) {
      if (!data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择家庭");
      }

      const user = await getOrCreateCaller();
      const result = await familyStore.demoteSelfFromAdmin({
        familyId: data.familyId,
        userId: user._id,
        timestamp: now(),
      });

      if (result.outcome === "last-admin") {
        throw new ApiError(
          "LAST_ADMIN_CANNOT_DEMOTE",
          "请先提升另一名家庭成员为管理员",
        );
      }

      if (result.outcome !== "updated") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以降级自己",
        );
      }

      return {
        member: {
          id: result.membership.userId,
          role: result.membership.role,
        },
      };
    },

    async removeMember(data) {
      if (!data.familyId || !data.targetUserId) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择要移除的家庭成员",
        );
      }

      const user = await getOrCreateCaller();

      if (user._id === data.targetUserId) {
        throw new ApiError(
          "USE_LEAVE_FAMILY",
          "请使用退出家庭来结束自己的成员关系",
        );
      }

      const result = await familyStore.removeMember({
        familyId: data.familyId,
        callerUserId: user._id,
        targetUserId: data.targetUserId,
        timestamp: now(),
      });

      if (result.outcome === "admin-required") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以移除成员",
        );
      }

      if (result.outcome === "target-admin") {
        throw new ApiError(
          "CANNOT_REMOVE_ADMIN",
          "不能移除另一名管理员，请对方先主动降级",
        );
      }

      if (result.outcome !== "updated") {
        throw new ApiError(
          "MEMBER_NOT_FOUND",
          "该成员已不在当前家庭",
        );
      }

      return {
        member: {
          id: result.membership.userId,
          status: result.membership.status,
        },
      };
    },

    async leaveFamily(data) {
      if (!data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择要退出的家庭");
      }

      const user = await getOrCreateCaller();
      const result = await familyStore.leaveFamily({
        familyId: data.familyId,
        userId: user._id,
        timestamp: now(),
      });

      if (result.outcome === "last-admin") {
        throw new ApiError(
          "LAST_ADMIN_MUST_TRANSFER",
          "你是唯一管理员，请先选择一名成员接任",
        );
      }

      if (result.outcome !== "updated") {
        throw new ApiError(
          "MEMBER_NOT_FOUND",
          "你已不在这个家庭中",
        );
      }

      return {
        familyId: data.familyId,
        status: result.membership.status,
      };
    },

    async transferAdminAndLeave(data) {
      if (
        !data.familyId ||
        !data.successorUserId
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择接任管理员的家庭成员",
        );
      }

      const user = await getOrCreateCaller();

      if (user._id === data.successorUserId) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "接任者必须是另一名有效家庭成员",
        );
      }

      const result = await familyStore.transferAdminAndLeave({
        familyId: data.familyId,
        userId: user._id,
        successorUserId: data.successorUserId,
        timestamp: now(),
      });

      if (result.outcome === "admin-required") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员需要转让后退出",
        );
      }

      if (result.outcome !== "updated") {
        throw new ApiError(
          "SUCCESSOR_NOT_FOUND",
          "接任者已不在当前家庭，请重新选择",
        );
      }

      return {
        familyId: data.familyId,
        successor: {
          id: result.successor.userId,
          role: result.successor.role,
        },
        status: result.membership.status,
      };
    },

    async dissolveFamily(data) {
      if (
        !data.familyId ||
        typeof data.confirmationName !== "string"
      ) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请输入家庭名称以确认解散",
        );
      }

      const user = await getOrCreateCaller();
      const result = await familyStore.dissolveFamily({
        familyId: data.familyId,
        userId: user._id,
        confirmationName: data.confirmationName.trim(),
      });

      if (result.outcome === "admin-required") {
        throw new ApiError(
          "ADMIN_REQUIRED",
          "只有家庭管理员可以解散家庭",
        );
      }

      if (result.outcome === "confirmation-mismatch") {
        throw new ApiError(
          "CONFIRMATION_MISMATCH",
          "输入的家庭名称不一致",
        );
      }

      if (result.outcome !== "dissolved") {
        throw new ApiError(
          "FAMILY_NOT_FOUND",
          "家庭不存在或已经解散",
        );
      }

      return {
        familyId: data.familyId,
        dissolved: true,
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
