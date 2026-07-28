const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createProfileApi,
} = require("../cloudfunctions/profile-api/src/create-profile-api");
const {
  createInMemoryProfileStore,
} = require("./support/create-in-memory-profile-store");

function createUser({
  id = "user-1",
  openId = "openid-1",
  displayName = "用户一",
} = {}) {
  return {
    _id: id,
    wechatOpenId: openId,
    displayName,
    avatarUrl: null,
  };
}

function createMembership({
  id,
  familyId = "family-1",
  userId,
  role = "member",
  profileManagementAllowed = false,
  status = "active",
}) {
  return {
    _id: id,
    familyId,
    userId,
    role,
    profileManagementAllowed,
    status,
    revision: 1,
  };
}

test("本人可以创建并更新自己的唯一健康档案", async () => {
  const user = createUser();
  const profileStore = createInMemoryProfileStore({
    users: [user],
  });
  const timestamps = [
    new Date("2026-07-28T12:00:00.000Z"),
    new Date("2026-07-28T12:05:00.000Z"),
  ];
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: user.wechatOpenId,
    }),
    profileStore,
    createId: () => "profile-1",
    now: () => timestamps.shift(),
  });

  const created = await api.handle({
    action: "saveMyProfile",
    requestId: "req-create-profile",
    data: {
      expectedRevision: 0,
      profile: {
        diabetesStatus: "prediabetes",
        hypertensionStatus: "none",
      },
    },
  });
  const updated = await api.handle({
    action: "saveMyProfile",
    requestId: "req-update-profile",
    data: {
      expectedRevision: 1,
      profile: {
        diabetesStatus: "type2",
        hypertensionStatus: "diagnosed",
        hypertensionGrade: "2",
      },
    },
  });
  const read = await api.handle({
    action: "getMyProfile",
    requestId: "req-read-profile",
  });

  assert.equal(created.ok, true);
  assert.equal(created.data.profile.revision, 1);
  assert.deepEqual(updated.data.profile, {
    ownerUserId: "user-1",
    diabetesStatus: "type2",
    hypertensionStatus: "diagnosed",
    hypertensionGrade: "2",
    revision: 2,
    updatedAt: "2026-07-28T12:05:00.000Z",
  });
  assert.deepEqual(read.data, {
    profile: updated.data.profile,
    canEdit: true,
  });
});

test("同家庭有效成员可以查看彼此的全局健康档案", async () => {
  const viewer = createUser({
    id: "viewer",
    openId: "viewer-openid",
    displayName: "查看者",
  });
  const owner = createUser({
    id: "owner",
    openId: "owner-openid",
    displayName: "档案所有者",
  });
  const profileStore = createInMemoryProfileStore({
    users: [viewer, owner],
    memberships: [
      createMembership({
        id: "viewer-membership",
        userId: viewer._id,
        role: "admin",
      }),
      createMembership({
        id: "owner-membership",
        userId: owner._id,
        profileManagementAllowed: false,
      }),
    ],
    profiles: [
      {
        _id: "profile-owner",
        userId: owner._id,
        diabetesStatus: "none",
        hypertensionStatus: "uncertain",
        revision: 1,
        updatedByUserId: owner._id,
        createdAt: new Date("2026-07-28T12:00:00.000Z"),
        updatedAt: new Date("2026-07-28T12:00:00.000Z"),
      },
    ],
  });
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: viewer.wechatOpenId,
    }),
    profileStore,
  });

  const result = await api.handle({
    action: "getMemberProfile",
    requestId: "req-view-member-profile",
    data: {
      familyId: "family-1",
      userId: owner._id,
    },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-view-member-profile",
    data: {
      owner: {
        id: owner._id,
        displayName: "档案所有者",
        avatarUrl: null,
      },
      profile: {
        ownerUserId: owner._id,
        diabetesStatus: "none",
        hypertensionStatus: "uncertain",
        revision: 1,
        updatedAt: "2026-07-28T12:00:00.000Z",
      },
      canEdit: false,
      profileManagementAllowed: false,
    },
  });
});

test("管理员也不能绕过档案所有者的家庭代管选择", async () => {
  const admin = createUser({
    id: "admin",
    openId: "admin-openid",
    displayName: "管理员",
  });
  const owner = createUser({
    id: "owner",
    openId: "owner-openid",
    displayName: "档案所有者",
  });
  const profileStore = createInMemoryProfileStore({
    users: [admin, owner],
    memberships: [
      createMembership({
        id: "admin-membership",
        userId: admin._id,
        role: "admin",
      }),
      createMembership({
        id: "owner-membership",
        userId: owner._id,
        profileManagementAllowed: false,
      }),
    ],
  });
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: admin.wechatOpenId,
    }),
    profileStore,
    createId: () => "profile-owner",
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });

  const result = await api.handle({
    action: "saveManagedProfile",
    requestId: "req-admin-save-without-grant",
    data: {
      familyId: "family-1",
      userId: owner._id,
      expectedRevision: 0,
      profile: {
        diabetesStatus: "none",
        hypertensionStatus: "none",
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: "req-admin-save-without-grant",
    error: {
      code: "PROFILE_MANAGEMENT_DENIED",
      message: "对方尚未允许当前家庭代管健康档案",
    },
  });
});

test("档案所有者关闭家庭代管后，家人的旧页面也不能继续保存", async () => {
  const caregiver = createUser({
    id: "caregiver",
    openId: "caregiver-openid",
    displayName: "代管家人",
  });
  const owner = createUser({
    id: "owner",
    openId: "owner-openid",
    displayName: "档案所有者",
  });
  const profileStore = createInMemoryProfileStore({
    users: [caregiver, owner],
    memberships: [
      createMembership({
        id: "caregiver-membership",
        userId: caregiver._id,
      }),
      createMembership({
        id: "owner-membership",
        userId: owner._id,
        profileManagementAllowed: true,
      }),
    ],
  });
  let currentOpenId = caregiver.wechatOpenId;
  let currentTime = new Date("2026-07-28T12:00:00.000Z");
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: currentOpenId,
    }),
    profileStore,
    createId: () => "profile-owner",
    now: () => currentTime,
  });

  const firstSave = await api.handle({
    action: "saveManagedProfile",
    requestId: "req-managed-save-before-revoke",
    data: {
      familyId: "family-1",
      userId: owner._id,
      expectedRevision: 0,
      profile: {
        diabetesStatus: "none",
        hypertensionStatus: "none",
      },
    },
  });

  currentOpenId = owner.wechatOpenId;
  currentTime = new Date("2026-07-28T12:05:00.000Z");
  const disabled = await api.handle({
    action: "setProfileManagementAllowed",
    requestId: "req-disable-profile-management",
    data: {
      familyId: "family-1",
      allowed: false,
    },
  });

  currentOpenId = caregiver.wechatOpenId;
  currentTime = new Date("2026-07-28T12:10:00.000Z");
  const staleSave = await api.handle({
    action: "saveManagedProfile",
    requestId: "req-managed-save-after-revoke",
    data: {
      familyId: "family-1",
      userId: owner._id,
      expectedRevision: 1,
      profile: {
        diabetesStatus: "type2",
        hypertensionStatus: "none",
      },
    },
  });

  assert.equal(firstSave.ok, true);
  assert.deepEqual(disabled.data, {
    familyId: "family-1",
    profileManagementAllowed: false,
  });
  assert.equal(staleSave.ok, false);
  assert.equal(staleSave.error.code, "PROFILE_MANAGEMENT_DENIED");
});

test("家庭档案页只列出当前家庭的有效成员", async () => {
  const caller = createUser({
    id: "caller",
    openId: "caller-openid",
    displayName: "我",
  });
  const activeMember = createUser({
    id: "active-member",
    openId: "active-openid",
    displayName: "有效家人",
  });
  const inactiveMember = createUser({
    id: "inactive-member",
    openId: "inactive-openid",
    displayName: "已退出家人",
  });
  const profileStore = createInMemoryProfileStore({
    users: [caller, activeMember, inactiveMember],
    memberships: [
      createMembership({
        id: "caller-membership",
        userId: caller._id,
        role: "admin",
      }),
      createMembership({
        id: "active-membership",
        userId: activeMember._id,
        profileManagementAllowed: true,
      }),
      createMembership({
        id: "inactive-membership",
        userId: inactiveMember._id,
        status: "inactive",
      }),
    ],
  });
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: caller.wechatOpenId,
    }),
    profileStore,
  });

  const result = await api.handle({
    action: "listFamilyMembers",
    requestId: "req-list-profile-members",
    data: {
      familyId: "family-1",
    },
  });

  assert.deepEqual(result, {
    ok: true,
    requestId: "req-list-profile-members",
    data: {
      members: [
        {
          id: caller._id,
          displayName: "我",
          avatarUrl: null,
          role: "admin",
          profileManagementAllowed: false,
          isSelf: true,
        },
        {
          id: activeMember._id,
          displayName: "有效家人",
          avatarUrl: null,
          role: "member",
          profileManagementAllowed: true,
          isSelf: false,
        },
      ],
    },
  });
});

test("旧版本档案不能静默覆盖较新的本人修改", async () => {
  const user = createUser();
  const profileStore = createInMemoryProfileStore({
    users: [user],
  });
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: user.wechatOpenId,
    }),
    profileStore,
    createId: () => "profile-1",
    now: () => new Date("2026-07-28T12:00:00.000Z"),
  });
  const profile = {
    diabetesStatus: "none",
    hypertensionStatus: "none",
  };

  await api.handle({
    action: "saveMyProfile",
    requestId: "req-profile-first-version",
    data: {
      expectedRevision: 0,
      profile,
    },
  });
  const newer = await api.handle({
    action: "saveMyProfile",
    requestId: "req-profile-newer-version",
    data: {
      expectedRevision: 1,
      profile: {
        ...profile,
        diabetesStatus: "prediabetes",
      },
    },
  });
  const stale = await api.handle({
    action: "saveMyProfile",
    requestId: "req-profile-stale-version",
    data: {
      expectedRevision: 1,
      profile: {
        ...profile,
        diabetesStatus: "type2",
      },
    },
  });

  assert.equal(newer.ok, true);
  assert.deepEqual(stale, {
    ok: false,
    requestId: "req-profile-stale-version",
    error: {
      code: "REVISION_CONFLICT",
      message: "档案已被更新，请刷新后再修改",
    },
  });
});

test("任一成员关系失效后都不能继续查看他人档案", async () => {
  const caller = createUser({
    id: "caller",
    openId: "caller-openid",
  });
  const formerMember = createUser({
    id: "former-member",
    openId: "former-openid",
  });
  const profileStore = createInMemoryProfileStore({
    users: [caller, formerMember],
    memberships: [
      createMembership({
        id: "caller-membership",
        userId: caller._id,
      }),
      createMembership({
        id: "former-membership",
        userId: formerMember._id,
        status: "inactive",
        profileManagementAllowed: true,
      }),
    ],
  });
  const api = createProfileApi({
    getCallerIdentity: async () => ({
      openId: caller.wechatOpenId,
    }),
    profileStore,
  });

  const result = await api.handle({
    action: "getMemberProfile",
    requestId: "req-view-inactive-member",
    data: {
      familyId: "family-1",
      userId: formerMember._id,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PROFILE_ACCESS_DENIED");
});
