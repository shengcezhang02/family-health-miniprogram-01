function createDailyHealthPageLoader({
  bootstrapFamily,
  resolveCurrentFamily,
  getDailyHealth,
}) {
  return {
    async load(date) {
      const bootstrapResult = await bootstrapFamily();
      const family = resolveCurrentFamily(
        bootstrapResult.families || [],
      );

      if (!family) {
        const error = new Error("请先创建或加入一个家庭空间");
        error.code = "FAMILY_REQUIRED";
        throw error;
      }

      const dailyHealth = await getDailyHealth({
        familyId: family.id,
        date,
      });

      return {
        family,
        records: dailyHealth.records || [],
        reminders: dailyHealth.reminders || [],
      };
    },
  };
}

module.exports = {
  createDailyHealthPageLoader,
};
