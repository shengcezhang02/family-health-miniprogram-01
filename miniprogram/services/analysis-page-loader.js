const FAMILY_REQUIRED_MESSAGE = "请先创建或加入家庭";

function addMemberDisplayLabels(members = []) {
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

function createAnalysisPageLoader({
  bootstrapFamily,
  getAnalysisData,
  resolveCurrentFamily,
  getCachedAnalysisData = () => undefined,
  getCachedUserId = () => "",
  peekCurrentFamilyId = () => "",
  getCachedFamily = () => undefined,
}) {
  function decorate(result, family, userId) {
    return {
      userId,
      family,
      ...result,
      members: addMemberDisplayLabels(result.members || []),
    };
  }

  function getStartupSnapshot() {
    const userId = getCachedUserId();
    const familyId = peekCurrentFamilyId();
    const family = familyId ? getCachedFamily(familyId) : undefined;
    const cached = family
      ? getCachedAnalysisData({ familyId: family.id })
      : undefined;

    if (!userId || !family || !cached) {
      return undefined;
    }

    return decorate(cached, family, userId);
  }

  return {
    getStartupSnapshot,

    async load({ onCached, fresh = false } = {}) {
      const bootstrapResult = await bootstrapFamily({ fresh });
      const family = resolveCurrentFamily(
        bootstrapResult.families || [],
      );

      if (!family) {
        const error = new Error(FAMILY_REQUIRED_MESSAGE);
        error.code = "FAMILY_REQUIRED";
        throw error;
      }

      const request = { familyId: family.id };
      const userId = bootstrapResult.user?.id || getCachedUserId();
      const cached = getCachedAnalysisData(request);

      if (cached && onCached) {
        onCached(decorate(cached, family, userId));
      }

      const result = await getAnalysisData(request, { fresh });
      return decorate(result, family, userId);
    },
  };
}

module.exports = {
  addMemberDisplayLabels,
  createAnalysisPageLoader,
};
