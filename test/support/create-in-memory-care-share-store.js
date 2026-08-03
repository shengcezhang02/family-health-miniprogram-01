function clone(value) {
  return structuredClone(value);
}

function createInMemoryCareShareStore({
  users = [],
  families = [],
  memberships = [],
  reminders = [],
  careShares = [],
} = {}) {
  const state = {
    users: clone(users),
    families: clone(families),
    memberships: clone(memberships),
    reminders: clone(reminders),
    careShares: clone(careShares),
  };

  return {
    async getUserByOpenId(openId) {
      return clone(
        state.users.find((user) => user.wechatOpenId === openId) ?? null,
      );
    },

    async getUserById(userId) {
      return clone(
        state.users.find((user) => user._id === userId) ?? null,
      );
    },

    async getFamilyById(familyId) {
      return clone(
        state.families.find((family) => family._id === familyId) ?? null,
      );
    },

    async getActiveMembership(familyId, userId) {
      return clone(
        state.memberships.find(
          (membership) =>
            membership.familyId === familyId &&
            membership.userId === userId &&
            membership.status === "active",
        ) ?? null,
      );
    },

    async getReminderById(reminderId) {
      return clone(
        state.reminders.find((reminder) => reminder._id === reminderId) ??
          null,
      );
    },

    async createCareShare(share) {
      const existing = state.careShares.find(
        (candidate) => candidate._id === share._id,
      );

      if (existing) {
        return {
          share: clone(existing),
          outcome: "replayed",
        };
      }

      state.careShares.push(clone(share));
      return {
        share: clone(share),
        outcome: "created",
      };
    },

    async createImmediateCareShare({ share, reminder }) {
      const existing = state.careShares.find(
        (candidate) => candidate._id === share._id,
      );

      if (existing) {
        return {
          share: clone(existing),
          reminder: clone(
            state.reminders.find(
              (candidate) => candidate._id === existing.reminderId,
            ),
          ),
          outcome: "replayed",
        };
      }

      state.reminders.push(clone(reminder));
      state.careShares.push(clone(share));
      return {
        share: clone(share),
        reminder: clone(reminder),
        outcome: "created",
      };
    },

    async getCareShareByTokenHash(tokenHash) {
      return clone(
        state.careShares.find(
          (share) => share.tokenHash === tokenHash,
        ) ?? null,
      );
    },

    inspectCareShares() {
      return clone(state.careShares);
    },

    inspectReminders() {
      return clone(state.reminders);
    },
  };
}

module.exports = {
  createInMemoryCareShareStore,
};
