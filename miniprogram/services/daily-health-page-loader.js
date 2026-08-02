function createDailyHealthPageLoader({
  bootstrapFamily,
  resolveCurrentFamily,
  getDailyHealth,
  getCachedDailyHealth = () => undefined,
  peekCurrentFamilyId = () => "",
  getCachedFamily = () => undefined,
}) {
  function toPageResult(family, dailyHealth) {
    return {
      family,
      members: dailyHealth.members || [],
      records: dailyHealth.records || [],
      reminders: dailyHealth.reminders || [],
      recurringRules: dailyHealth.recurringRules || [],
    };
  }

  return {
    getStartupSnapshot(date) {
      const familyId = peekCurrentFamilyId();
      const family = familyId
        ? getCachedFamily(familyId)
        : undefined;
      const dailyHealth = family
        ? getCachedDailyHealth({
            familyId,
            date,
          })
        : undefined;

      return family && dailyHealth
        ? toPageResult(family, dailyHealth)
        : undefined;
    },

    async load(date, { onCached } = {}) {
      const bootstrapResult = await bootstrapFamily();
      const family = resolveCurrentFamily(
        bootstrapResult.families || [],
      );

      if (!family) {
        const error = new Error("请先创建或加入一个家庭空间");
        error.code = "FAMILY_REQUIRED";
        throw error;
      }

      const request = {
        familyId: family.id,
        date,
      };
      const cachedDailyHealth = getCachedDailyHealth(request);

      if (cachedDailyHealth && onCached) {
        onCached(toPageResult(family, cachedDailyHealth));
      }

      const dailyHealth = await getDailyHealth(request);
      return toPageResult(family, dailyHealth);
    },

    async prefetch(familyId, dates) {
      await Promise.all(
        (dates || []).map((date) =>
          getDailyHealth({
            familyId,
            date,
          }).catch(() => undefined),
        ),
      );
    },
  };
}

module.exports = {
  createDailyHealthPageLoader,
};
