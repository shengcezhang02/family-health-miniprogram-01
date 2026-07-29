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
}) {
  async function loadFamily(familyId) {
    const bootstrapResult = await bootstrapFamily();
    const family = (bootstrapResult.families || []).find(
      (item) => item.id === familyId,
    );

    if (!family) {
      const error = new Error(FAMILY_ACCESS_DENIED_MESSAGE);
      error.code = "FAMILY_ACCESS_DENIED";
      throw error;
    }

    return family;
  }

  return {
    async loadEditor(familyId) {
      const family = await loadFamily(familyId);
      const [membersResult, templatesResult] = await Promise.all([
        listFamilyMembers({ familyId }),
        listTemplates({ familyId }),
      ]);

      return {
        family,
        members: addMemberDisplayLabels(
          membersResult.members || [],
        ),
        templates: templatesResult.templates || [],
      };
    },

    async loadTimeline(familyId) {
      const family = await loadFamily(familyId);
      const [timelineResult, membersResult] = await Promise.all([
        getRecordTimeline({ familyId }),
        listFamilyMembers({ familyId }),
      ]);

      return {
        family,
        items: timelineResult.items || [],
        members: addMemberDisplayLabels(
          membersResult.members || [],
        ),
      };
    },
  };
}

module.exports = {
  addMemberDisplayLabels,
  FAMILY_ACCESS_DENIED_MESSAGE,
  createRecordPageLoader,
};
