class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const DIABETES_STATUSES = new Set([
  "none",
  "prediabetes",
  "type1",
  "type2",
  "other",
  "uncertain",
]);
const HYPERTENSION_STATUSES = new Set([
  "none",
  "diagnosed",
  "uncertain",
]);
const HYPERTENSION_GRADES = new Set(["1", "2", "3"]);

function toProfileSummary(profile) {
  if (!profile) {
    return null;
  }

  const summary = {
    ownerUserId: profile.userId,
    diabetesStatus: profile.diabetesStatus,
    hypertensionStatus: profile.hypertensionStatus,
    revision: profile.revision,
    updatedAt: profile.updatedAt.toISOString(),
  };

  if (profile.hypertensionGrade) {
    summary.hypertensionGrade = profile.hypertensionGrade;
  }

  return summary;
}

function toUserSummary(user) {
  return {
    id: user._id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
  };
}

function validateProfileInput(data) {
  const profile = data.profile ?? {};

  if (
    !Number.isInteger(data.expectedRevision) ||
    data.expectedRevision < 0 ||
    !DIABETES_STATUSES.has(profile.diabetesStatus) ||
    !HYPERTENSION_STATUSES.has(profile.hypertensionStatus)
  ) {
    throw new ApiError("INVALID_ARGUMENT", "请完整填写有效的健康档案");
  }

  if (
    profile.hypertensionStatus === "diagnosed" &&
    profile.hypertensionGrade !== undefined &&
    !HYPERTENSION_GRADES.has(profile.hypertensionGrade)
  ) {
    throw new ApiError("INVALID_ARGUMENT", "请选择有效的高血压分级");
  }

  return {
    diabetesStatus: profile.diabetesStatus,
    hypertensionStatus: profile.hypertensionStatus,
    ...(profile.hypertensionStatus === "diagnosed" &&
    profile.hypertensionGrade
      ? { hypertensionGrade: profile.hypertensionGrade }
      : {}),
  };
}

function createProfileApi({
  getCallerIdentity,
  profileStore,
  createId,
  now,
  reportError = () => {},
} = {}) {
  async function getCaller() {
    const identity = await getCallerIdentity();

    if (!identity?.openId) {
      throw new ApiError(
        "UNAUTHENTICATED",
        "无法确认微信身份，请重新进入小程序",
      );
    }

    const user = await profileStore.getUserByOpenId(identity.openId);

    if (!user) {
      throw new ApiError(
        "UNAUTHENTICATED",
        "用户信息尚未初始化，请重新进入小程序",
      );
    }

    return user;
  }

  const actions = {
    async getMyProfile() {
      const user = await getCaller();
      const profile = await profileStore.getProfileByUserId(user._id);

      return {
        profile: toProfileSummary(profile),
        canEdit: true,
      };
    },

    async saveMyProfile(data) {
      const values = validateProfileInput(data);
      const user = await getCaller();
      const result = await profileStore.saveOwnProfile({
        userId: user._id,
        profileId: createId(),
        expectedRevision: data.expectedRevision,
        values,
        timestamp: now(),
      });

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "档案已被更新，请刷新后再修改",
        );
      }

      return {
        profile: toProfileSummary(result.profile),
      };
    },

    async getMemberProfile(data) {
      if (!data.familyId || !data.userId) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择要查看的家庭成员",
        );
      }

      const caller = await getCaller();
      const [callerMembership, ownerMembership, owner, profile] =
        await Promise.all([
          profileStore.getActiveMembership(data.familyId, caller._id),
          profileStore.getActiveMembership(data.familyId, data.userId),
          profileStore.getUserById(data.userId),
          profileStore.getProfileByUserId(data.userId),
        ]);

      if (!callerMembership || !ownerMembership || !owner) {
        throw new ApiError(
          "PROFILE_ACCESS_DENIED",
          "只能查看同一家庭有效成员的健康档案",
        );
      }

      return {
        owner: toUserSummary(owner),
        profile: toProfileSummary(profile),
        canEdit:
          caller._id === owner._id ||
          ownerMembership.profileManagementAllowed === true,
        profileManagementAllowed:
          ownerMembership.profileManagementAllowed === true,
      };
    },

    async saveManagedProfile(data) {
      if (!data.familyId || !data.userId) {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择要代管的家庭成员",
        );
      }

      const values = validateProfileInput(data);
      const caller = await getCaller();
      const result = await profileStore.saveManagedProfile({
        familyId: data.familyId,
        callerUserId: caller._id,
        ownerUserId: data.userId,
        profileId: createId(),
        expectedRevision: data.expectedRevision,
        values,
        timestamp: now(),
      });

      if (result.outcome === "permission-denied") {
        throw new ApiError(
          "PROFILE_MANAGEMENT_DENIED",
          "对方尚未允许当前家庭代管健康档案",
        );
      }

      if (result.outcome === "revision-conflict") {
        throw new ApiError(
          "REVISION_CONFLICT",
          "档案已被更新，请刷新后再修改",
        );
      }

      return {
        profile: toProfileSummary(result.profile),
      };
    },

    async setProfileManagementAllowed(data) {
      if (!data.familyId || typeof data.allowed !== "boolean") {
        throw new ApiError(
          "INVALID_ARGUMENT",
          "请选择是否允许当前家庭代管健康档案",
        );
      }

      const caller = await getCaller();
      const result = await profileStore.setProfileManagementAllowed({
        familyId: data.familyId,
        userId: caller._id,
        allowed: data.allowed,
        timestamp: now(),
      });

      if (result.outcome !== "updated") {
        throw new ApiError(
          "PROFILE_ACCESS_DENIED",
          "你已不是这个家庭的有效成员",
        );
      }

      return {
        familyId: data.familyId,
        profileManagementAllowed:
          result.membership.profileManagementAllowed,
      };
    },

    async listFamilyMembers(data) {
      if (!data.familyId) {
        throw new ApiError("INVALID_ARGUMENT", "请选择家庭");
      }

      const caller = await getCaller();
      const entries = await profileStore.listActiveFamilyMembers(
        data.familyId,
      );

      if (
        !entries.some(
          ({ membership }) => membership.userId === caller._id,
        )
      ) {
        throw new ApiError(
          "PROFILE_ACCESS_DENIED",
          "你已不是这个家庭的有效成员",
        );
      }

      const members = entries.map(({ user, membership }) => ({
        ...toUserSummary(user),
        role: membership.role,
        profileManagementAllowed:
          membership.profileManagementAllowed === true,
        isSelf: user._id === caller._id,
      }));
      members.sort(
        (left, right) => Number(right.isSelf) - Number(left.isSelf),
      );

      return {
        members,
      };
    },
  };

  return {
    async handle(request = {}) {
      const action = actions[request.action];

      if (!action) {
        return {
          ok: false,
          requestId: request.requestId,
          error: {
            code: "UNSUPPORTED_ACTION",
            message: "暂不支持这个操作",
          },
        };
      }

      try {
        return {
          ok: true,
          requestId: request.requestId,
          data: await action(request.data ?? {}),
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
    },
  };
}

module.exports = {
  createProfileApi,
};
