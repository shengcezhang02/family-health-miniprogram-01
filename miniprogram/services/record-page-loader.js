const FAMILY_ACCESS_DENIED_MESSAGE =
  "当前微信账号尚未加入这个家庭，请先返回首页创建或加入家庭";

function addMemberDisplayLabels(members) {
  let familyNumber = 0;

  return members.map((member) => {
    if (member.isSelf) {
      return {
        ...member,
        displayLabel: `${member.displayName}（我）`,
      };
    }

    familyNumber += 1;
    return {
      ...member,
      displayLabel: `${member.displayName}（家人 ${familyNumber}）`,
    };
  });
}

function createRecordPageLoader({
  bootstrapFamily,
  listFamilyMembers,
  listTemplates,
  getRecordTimeline,
  getDashboardData,
  resolveCurrentFamily,
  getCachedRecordTimeline = () => undefined,
  getCachedFamilyMembers = () => undefined,
  getCachedTemplates = () => undefined,
  getCachedDashboardData = () => undefined,
  getCachedUserId = () => "",
  peekCurrentFamilyId = () => "",
  getCachedFamily = () => undefined,
}) {
  async function loadFamilyContext(familyId, options) {
    const bootstrapResult = await bootstrapFamily(options);
    const families = bootstrapResult.families || [];
    const family = familyId
      ? families.find((item) => item.id === familyId)
      : resolveCurrentFamily?.(families);

    if (!family) {
      const error = new Error(FAMILY_ACCESS_DENIED_MESSAGE);
      error.code = "FAMILY_ACCESS_DENIED";
      throw error;
    }

    return {
      family,
      userId: bootstrapResult.user?.id || "",
    };
  }

  async function loadFamily(familyId) {
    return (await loadFamilyContext(familyId)).family;
  }

  return {
    getDashboardStartupSnapshot() {
      const userId = getCachedUserId();
      const familyId = peekCurrentFamilyId();
      const family = familyId
        ? getCachedFamily(familyId)
        : undefined;
      const request = { familyId };
      const cachedDashboard = family
        ? getCachedDashboardData(request)
        : undefined;
      const cachedTemplates = family
        ? getCachedTemplates(request)
        : undefined;

      if (
        !userId ||
        !family ||
        !cachedDashboard ||
        !cachedTemplates
      ) {
        return undefined;
      }

      return {
        userId,
        family,
        ...cachedDashboard,
        members: addMemberDisplayLabels(
          cachedDashboard.members || [],
        ),
        templates: cachedTemplates.templates || [],
      };
    },

    getEditorStartupSnapshot(familyId) {
      const family = familyId
        ? getCachedFamily(familyId)
        : undefined;
      const request = { familyId };
      const cachedMembers = family
        ? getCachedFamilyMembers(request)
        : undefined;
      const cachedTemplates = family
        ? getCachedTemplates(request)
        : undefined;

      if (!family || !cachedMembers || !cachedTemplates) {
        return undefined;
      }

      return {
        family,
        members: addMemberDisplayLabels(
          cachedMembers.members || [],
        ),
        templates: cachedTemplates.templates || [],
      };
    },

    getStartupSnapshot() {
      const familyId = peekCurrentFamilyId();
      const family = familyId
        ? getCachedFamily(familyId)
        : undefined;
      const request = {
        familyId,
      };
      const cachedTimeline = family
        ? getCachedRecordTimeline(request)
        : undefined;
      const cachedMembers = family
        ? getCachedFamilyMembers(request)
        : undefined;

      if (!family || !cachedTimeline || !cachedMembers) {
        return undefined;
      }

      return {
        family,
        items: cachedTimeline.items || [],
        members: addMemberDisplayLabels(
          cachedMembers.members || [],
        ),
      };
    },

    async loadEditor(
      familyId,
      { loadExistingItem = async () => null } = {},
    ) {
      const [
        bootstrapResult,
        membersResult,
        templatesResult,
        existingItemResult,
      ] = await Promise.all([
        bootstrapFamily(),
        listFamilyMembers({ familyId }),
        listTemplates({ familyId }),
        loadExistingItem(),
      ]);
      const family = (bootstrapResult.families || []).find(
        (item) => item.id === familyId,
      );

      if (!family) {
        const error = new Error(FAMILY_ACCESS_DENIED_MESSAGE);
        error.code = "FAMILY_ACCESS_DENIED";
        throw error;
      }

      return {
        family,
        members: addMemberDisplayLabels(
          membersResult.members || [],
        ),
        templates: templatesResult.templates || [],
        ...(existingItemResult
          ? { existingItemResult }
          : {}),
      };
    },

    async loadTimeline(familyId, { onCached } = {}) {
      const family = await loadFamily(familyId);
      const request = {
        familyId: family.id,
      };
      const cachedTimeline = getCachedRecordTimeline(request);
      const cachedMembers = getCachedFamilyMembers(request);

      if (cachedTimeline && cachedMembers && onCached) {
        onCached({
          family,
          items: cachedTimeline.items || [],
          members: addMemberDisplayLabels(
            cachedMembers.members || [],
          ),
        });
      }

      const [timelineResult, membersResult] = await Promise.all([
        getRecordTimeline(request),
        listFamilyMembers(request),
      ]);

      return {
        family,
        items: timelineResult.items || [],
        members: addMemberDisplayLabels(
          membersResult.members || [],
        ),
      };
    },

    async loadDashboard(
      familyId,
      { onCached, fresh = false } = {},
    ) {
      const { family, userId } = await loadFamilyContext(
        familyId,
        { fresh },
      );
      const request = {
        familyId: family.id,
      };
      const cachedDashboard = getCachedDashboardData(request);
      const cachedTemplates = getCachedTemplates(request);

      if (cachedDashboard && cachedTemplates && onCached) {
        onCached({
          userId: userId || getCachedUserId(),
          family,
          ...cachedDashboard,
          members: addMemberDisplayLabels(
            cachedDashboard.members || [],
          ),
          templates: cachedTemplates.templates || [],
        });
      }

      const [dashboardResult, templatesResult] =
        await Promise.all([
          getDashboardData(request, { fresh }),
          listTemplates(request, { fresh }),
        ]);

      return {
        userId,
        family,
        ...dashboardResult,
        members: addMemberDisplayLabels(
          dashboardResult.members || [],
        ),
        templates: templatesResult.templates || [],
      };
    },
  };
}

module.exports = {
  addMemberDisplayLabels,
  FAMILY_ACCESS_DENIED_MESSAGE,
  createRecordPageLoader,
};
