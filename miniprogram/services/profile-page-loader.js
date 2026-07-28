const FAMILY_ACCESS_DENIED_MESSAGE =
  "当前微信账号尚未加入这个家庭，请先返回首页创建或加入家庭";

function createProfilePageLoader({ bootstrapFamily, listFamilyMembers }) {
  return {
    async load(familyId) {
      const bootstrapResult = await bootstrapFamily();
      const family = (bootstrapResult.families || []).find(
        (item) => item.id === familyId
      );

      if (!family) {
        const error = new Error(FAMILY_ACCESS_DENIED_MESSAGE);
        error.code = "FAMILY_ACCESS_DENIED";
        throw error;
      }

      const membersResult = await listFamilyMembers({ familyId });

      return {
        family,
        members: membersResult.members || [],
      };
    },
  };
}

module.exports = {
  FAMILY_ACCESS_DENIED_MESSAGE,
  createProfilePageLoader,
};
