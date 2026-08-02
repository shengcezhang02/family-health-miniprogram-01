const app = getApp();
const {
  createProfilePageLoader,
} = require("../../services/profile-page-loader");

const profilePageLoader = createProfilePageLoader({
  bootstrapFamily: () => app.callFamilyApi("bootstrap"),
  listFamilyMembers: ({ familyId }) =>
    app.callProfileApi("listFamilyMembers", { familyId }),
});

const DIABETES_OPTIONS = [
  { value: "none", label: "未确诊" },
  { value: "prediabetes", label: "糖尿病前期" },
  { value: "type1", label: "1 型糖尿病" },
  { value: "type2", label: "2 型糖尿病" },
  { value: "other", label: "其他" },
  { value: "uncertain", label: "不确定" },
];
const HYPERTENSION_OPTIONS = [
  { value: "none", label: "未确诊" },
  { value: "diagnosed", label: "已确诊" },
  { value: "uncertain", label: "不确定" },
];
const GRADE_OPTIONS = [
  { value: "", label: "暂不填写" },
  { value: "1", label: "1 级" },
  { value: "2", label: "2 级" },
  { value: "3", label: "3 级" },
];

function findOptionIndex(options, value, fallbackValue) {
  const index = options.findIndex((option) => option.value === value);

  if (index >= 0) {
    return index;
  }

  return options.findIndex((option) => option.value === fallbackValue);
}

Page({
  data: {
    status: "loading",
    familyId: "",
    familyName: "",
    members: [],
    selectedMemberIndex: 0,
    selectedMember: null,
    profile: null,
    canEdit: false,
    profileManagementAllowed: false,
    diabetesOptions: DIABETES_OPTIONS,
    hypertensionOptions: HYPERTENSION_OPTIONS,
    gradeOptions: GRADE_OPTIONS,
    diabetesIndex: 5,
    hypertensionIndex: 2,
    gradeIndex: 0,
    saving: false,
    updatingPermission: false,
    message: "",
    errorMessage: "",
    showGoHome: false,
  },

  onLoad(options) {
    const familyId = options.familyId || "";
    const familyName = options.familyName
      ? decodeURIComponent(options.familyName)
      : "当前家庭";
    this._requestedUserId = options.userId || "";

    this.setData({
      familyId,
      familyName,
    });
    this.loadMembers();
  },

  onRetry() {
    this.loadMembers();
  },

  onGoHome() {
    wx.reLaunch({
      url: "/pages/index/index",
    });
  },

  async loadMembers() {
    if (!this.data.familyId) {
      this.setData({
        status: "error",
        errorMessage: "家庭信息已失效，请返回首页重试",
        showGoHome: true,
      });
      return;
    }

    this.setData({
      status: "loading",
      errorMessage: "",
      message: "",
      showGoHome: false,
    });

    try {
      const result = await profilePageLoader.load(this.data.familyId);
      const requestedMemberIndex = this._requestedUserId
        ? result.members.findIndex(
            (member) => member.id === this._requestedUserId,
          )
        : -1;
      const selectedMemberIndex =
        requestedMemberIndex >= 0
          ? requestedMemberIndex
          : Math.max(
              result.members.findIndex((member) => member.isSelf),
              0,
            );

      this.setData({
        familyName: result.family.name,
        members: result.members,
        selectedMemberIndex,
      });
      await this.loadProfile(selectedMemberIndex);
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载健康档案",
        showGoHome: error.code === "FAMILY_ACCESS_DENIED",
      });
    }
  },

  async loadProfile(memberIndex) {
    const member = this.data.members[memberIndex];

    if (!member) {
      this.setData({
        status: "error",
        errorMessage: "没有可查看的家庭成员",
      });
      return;
    }

    this.setData({
      status: "loading",
      selectedMemberIndex: memberIndex,
      selectedMember: member,
      message: "",
      errorMessage: "",
    });

    try {
      const result = await app.callProfileApi("getMemberProfile", {
        familyId: this.data.familyId,
        userId: member.id,
      });
      const profile = result.profile;

      this.setData({
        status: "ready",
        profile,
        canEdit: result.canEdit,
        profileManagementAllowed:
          result.profileManagementAllowed,
        diabetesIndex: findOptionIndex(
          DIABETES_OPTIONS,
          profile && profile.diabetesStatus,
          "uncertain",
        ),
        hypertensionIndex: findOptionIndex(
          HYPERTENSION_OPTIONS,
          profile && profile.hypertensionStatus,
          "uncertain",
        ),
        gradeIndex: findOptionIndex(
          GRADE_OPTIONS,
          profile && profile.hypertensionGrade,
          "",
        ),
      });
    } catch (error) {
      this.setData({
        status: "error",
        errorMessage: error.message || "暂时无法加载健康档案",
      });
    }
  },

  onMemberChange(event) {
    this.loadProfile(Number(event.detail.value));
  },

  onDiabetesChange(event) {
    this.setData({
      diabetesIndex: Number(event.detail.value),
      message: "",
    });
  },

  onHypertensionChange(event) {
    const hypertensionIndex = Number(event.detail.value);
    const isDiagnosed =
      HYPERTENSION_OPTIONS[hypertensionIndex].value === "diagnosed";

    this.setData({
      hypertensionIndex,
      gradeIndex: isDiagnosed ? this.data.gradeIndex : 0,
      message: "",
    });
  },

  onGradeChange(event) {
    this.setData({
      gradeIndex: Number(event.detail.value),
      message: "",
    });
  },

  async onSaveProfile() {
    if (!this.data.canEdit || this.data.saving) {
      return;
    }

    const diabetesStatus =
      DIABETES_OPTIONS[this.data.diabetesIndex].value;
    const hypertensionStatus =
      HYPERTENSION_OPTIONS[this.data.hypertensionIndex].value;
    const hypertensionGrade =
      GRADE_OPTIONS[this.data.gradeIndex].value;
    const data = {
      expectedRevision: this.data.profile
        ? this.data.profile.revision
        : 0,
      profile: {
        diabetesStatus,
        hypertensionStatus,
        ...(hypertensionStatus === "diagnosed" &&
        hypertensionGrade
          ? { hypertensionGrade }
          : {}),
      },
    };
    const action = this.data.selectedMember.isSelf
      ? "saveMyProfile"
      : "saveManagedProfile";

    if (!this.data.selectedMember.isSelf) {
      data.familyId = this.data.familyId;
      data.userId = this.data.selectedMember.id;
    }

    this.setData({
      saving: true,
      message: "",
      errorMessage: "",
    });

    try {
      const result = await app.callProfileApi(action, data);
      this.setData({
        profile: result.profile,
        message: "健康档案已保存",
      });
    } catch (error) {
      this.setData({
        errorMessage: error.message || "保存失败，请稍后重试",
      });
    } finally {
      this.setData({
        saving: false,
      });
    }
  },

  async onManagementChange(event) {
    if (
      !this.data.selectedMember ||
      !this.data.selectedMember.isSelf ||
      this.data.updatingPermission
    ) {
      return;
    }

    const allowed = event.detail.value;
    const previousAllowed = this.data.profileManagementAllowed;
    this.setData({
      profileManagementAllowed: allowed,
      updatingPermission: true,
      message: "",
      errorMessage: "",
    });

    try {
      await app.callProfileApi("setProfileManagementAllowed", {
        familyId: this.data.familyId,
        allowed,
      });
      const members = this.data.members.map((member) =>
        member.isSelf
          ? {
              ...member,
              profileManagementAllowed: allowed,
            }
          : member,
      );
      this.setData({
        members,
        message: allowed
          ? "已允许当前家庭代管档案"
          : "已关闭当前家庭代管",
      });
    } catch (error) {
      this.setData({
        profileManagementAllowed: previousAllowed,
        errorMessage: error.message || "权限更新失败，请稍后重试",
      });
    } finally {
      this.setData({
        updatingPermission: false,
      });
    }
  },
});
