function createInMemoryFamilyStore({ beforeFamilyCommit = async () => {} } = {}) {
  const usersByOpenId = new Map();
  const familiesById = new Map();
  const membershipsById = new Map();
  const invitesById = new Map();
  const recurringRulesById = new Map();
  const remindersById = new Map();

  function cleanupSubjectSchedule({
    familyId,
    subjectUserId,
    actorUserId,
    timestamp,
  }) {
    const pausedRuleIds = new Set();

    for (const [ruleId, rule] of recurringRulesById) {
      if (
        rule.familyId !== familyId ||
        rule.subjectUserId !== subjectUserId ||
        rule.status !== "active" ||
        rule.deletedAt
      ) {
        continue;
      }

      recurringRulesById.set(ruleId, {
        ...rule,
        status: "paused",
        pausedAt: timestamp,
        pausedByUserId: actorUserId,
        pauseReason: "subject_inactive",
        updatedByUserId: actorUserId,
        updatedAt: timestamp,
        revision: rule.revision + 1,
      });
      pausedRuleIds.add(ruleId);
    }

    for (const [reminderId, reminder] of remindersById) {
      if (
        reminder.familyId === familyId &&
        pausedRuleIds.has(reminder.sourceRecurringRuleId) &&
        reminder.status === "pending" &&
        !reminder.deletedAt &&
        new Date(reminder.plannedAt).getTime() >
          timestamp.getTime()
      ) {
        remindersById.delete(reminderId);
      }
    }
  }

  return {
    async getUserByOpenId(openId) {
      return usersByOpenId.get(openId) ?? null;
    },

    async createUser(user) {
      usersByOpenId.set(user.wechatOpenId, structuredClone(user));
      return structuredClone(user);
    },

    async createFamilyWithAdmin({ family, membership }) {
      await beforeFamilyCommit();
      familiesById.set(family._id, structuredClone(family));
      membershipsById.set(membership._id, structuredClone(membership));
    },

    async listActiveFamiliesByUserId(userId) {
      return [...membershipsById.values()]
        .filter(
          (membership) =>
            membership.userId === userId && membership.status === "active",
        )
        .map((membership) => ({
          family: structuredClone(familiesById.get(membership.familyId)),
          membership: structuredClone(membership),
        }));
    },

    async getActiveMembership(familyId, userId) {
      return (
        [...membershipsById.values()].find(
          (membership) =>
            membership.familyId === familyId &&
            membership.userId === userId &&
            membership.status === "active",
        ) ?? null
      );
    },

    async createInvite(invite) {
      invitesById.set(invite._id, structuredClone(invite));
      return structuredClone(invite);
    },

    async getInviteByTokenHash(tokenHash) {
      return (
        [...invitesById.values()].find(
          (invite) => invite.tokenHash === tokenHash,
        ) ?? null
      );
    },

    async getInviteByCredential(inviteQuery) {
      return (
        [...invitesById.values()].find((invite) =>
          Object.entries(inviteQuery).every(
            ([field, value]) => invite[field] === value,
          ),
        ) ?? null
      );
    },

    async getFamilyById(familyId) {
      return familiesById.get(familyId) ?? null;
    },

    async getUserById(userId) {
      return (
        [...usersByOpenId.values()].find((user) => user._id === userId) ?? null
      );
    },

    async updateUserDisplayName({ userId, displayName, timestamp }) {
      const user = [...usersByOpenId.values()].find(
        (candidate) => candidate._id === userId,
      );

      if (!user) {
        return null;
      }

      const updated = {
        ...user,
        displayName,
        revision: user.revision + 1,
        updatedAt: timestamp,
      };
      usersByOpenId.set(user.wechatOpenId, structuredClone(updated));
      return structuredClone(updated);
    },

    async joinFamilyWithInvite({
      inviteQuery,
      userId,
      profileManagementAllowed,
      externalAccessNoticeVersion,
      displayName,
      membershipId,
      timestamp,
    }) {
      const userEntry = [...usersByOpenId.entries()].find(
        ([, user]) => user._id === userId,
      );
      const renamedUser =
        displayName && userEntry
          ? {
              ...userEntry[1],
              displayName,
              revision: userEntry[1].revision + 1,
              updatedAt: timestamp,
            }
          : null;
      const invite = [...invitesById.values()].find(
        (candidate) =>
          Object.entries(inviteQuery).every(
            ([field, value]) => candidate[field] === value,
          ),
      );
      const existingMembership = invite
        ? [...membershipsById.values()].find(
            (membership) =>
              membership.familyId === invite.familyId &&
              membership.userId === userId,
          )
        : null;

      if (
        invite?.status === "used" &&
        invite.usedByUserId === userId &&
        existingMembership?.status === "active"
      ) {
        if (renamedUser) {
          usersByOpenId.set(userEntry[0], structuredClone(renamedUser));
        }
        return {
          family: structuredClone(familiesById.get(invite.familyId)),
          membership: structuredClone(existingMembership),
          ...(renamedUser ? { user: structuredClone(renamedUser) } : {}),
        };
      }

      if (
        !invite ||
        invite.status !== "active" ||
        invite.expiresAt.getTime() <= timestamp.getTime()
      ) {
        return null;
      }

      if (existingMembership?.status === "active") {
        return {
          outcome: "already-member",
        };
      }

      const membership = existingMembership
        ? {
            ...existingMembership,
            role: "member",
            status: "active",
            profileManagementAllowed,
            externalAccessNoticeVersion,
            externalAccessNoticeAcceptedAt: timestamp,
            joinedAt: timestamp,
            exitedAt: undefined,
            exitReason: undefined,
            revision: existingMembership.revision + 1,
            updatedAt: timestamp,
          }
        : {
            _id: membershipId,
            familyId: invite.familyId,
            userId,
            role: "member",
            status: "active",
            profileManagementAllowed,
            externalAccessNoticeVersion,
            externalAccessNoticeAcceptedAt: timestamp,
            joinedAt: timestamp,
            revision: 1,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      membershipsById.set(membership._id, structuredClone(membership));
      invitesById.set(invite._id, {
        ...invite,
        status: "used",
        usedByUserId: userId,
        usedAt: timestamp,
        revision: invite.revision + 1,
        updatedAt: timestamp,
      });
      if (renamedUser) {
        usersByOpenId.set(userEntry[0], structuredClone(renamedUser));
      }

      return {
        family: structuredClone(familiesById.get(invite.familyId)),
        membership: structuredClone(membership),
        ...(renamedUser ? { user: structuredClone(renamedUser) } : {}),
      };
    },

    async revokeInviteAsAdmin({ inviteId, userId, timestamp }) {
      const invite = invitesById.get(inviteId);

      if (
        !invite ||
        invite.status !== "active" ||
        invite.expiresAt.getTime() <= timestamp.getTime()
      ) {
        return {
          outcome: "unavailable",
        };
      }

      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === invite.familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (membership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const revokedInvite = {
        ...invite,
        status: "revoked",
        revokedByUserId: userId,
        revokedAt: timestamp,
        revision: invite.revision + 1,
        updatedAt: timestamp,
      };
      invitesById.set(invite._id, revokedInvite);

      return {
        outcome: "revoked",
        invite: structuredClone(revokedInvite),
      };
    },

    async promoteMemberToAdmin({
      familyId,
      callerUserId,
      targetUserId,
      timestamp,
    }) {
      const callerMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === callerUserId &&
          membership.status === "active",
      );

      if (callerMembership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const targetMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === targetUserId &&
          membership.status === "active",
      );

      if (!targetMembership) {
        return {
          outcome: "not-found",
        };
      }

      if (targetMembership.role === "admin") {
        return {
          outcome: "updated",
          membership: structuredClone(targetMembership),
        };
      }

      const updated = {
        ...targetMembership,
        role: "admin",
        revision: targetMembership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(updated._id, updated);
      const family = familiesById.get(familyId);
      familiesById.set(familyId, {
        ...family,
        revision: family.revision + 1,
        updatedAt: timestamp,
      });

      return {
        outcome: "updated",
        membership: structuredClone(updated),
      };
    },

    async demoteSelfFromAdmin({ familyId, userId, timestamp }) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (membership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const otherAdminExists = [...membershipsById.values()].some(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId !== userId &&
          candidate.status === "active" &&
          candidate.role === "admin",
      );

      if (!otherAdminExists) {
        return {
          outcome: "last-admin",
        };
      }

      const updated = {
        ...membership,
        role: "member",
        revision: membership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(updated._id, updated);
      const family = familiesById.get(familyId);
      familiesById.set(familyId, {
        ...family,
        revision: family.revision + 1,
        updatedAt: timestamp,
      });

      return {
        outcome: "updated",
        membership: structuredClone(updated),
      };
    },

    async removeMember({
      familyId,
      callerUserId,
      targetUserId,
      timestamp,
    }) {
      const callerMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === callerUserId &&
          membership.status === "active",
      );

      if (callerMembership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const targetMembership = [...membershipsById.values()].find(
        (membership) =>
          membership.familyId === familyId &&
          membership.userId === targetUserId &&
          membership.status === "active",
      );

      if (!targetMembership) {
        return {
          outcome: "not-found",
        };
      }

      if (targetMembership.role === "admin") {
        return {
          outcome: "target-admin",
        };
      }

      const updated = {
        ...targetMembership,
        status: "inactive",
        endedAt: timestamp,
        endedByUserId: callerUserId,
        endReason: "removed",
        revision: targetMembership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(updated._id, updated);
      cleanupSubjectSchedule({
        familyId,
        subjectUserId: targetUserId,
        actorUserId: callerUserId,
        timestamp,
      });
      const family = familiesById.get(familyId);
      familiesById.set(familyId, {
        ...family,
        revision: family.revision + 1,
        updatedAt: timestamp,
      });

      return {
        outcome: "updated",
        membership: structuredClone(updated),
      };
    },

    async leaveFamily({ familyId, userId, timestamp }) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (!membership) {
        return {
          outcome: "not-found",
        };
      }

      if (membership.role === "admin") {
        const otherAdminExists = [...membershipsById.values()].some(
          (candidate) =>
            candidate.familyId === familyId &&
            candidate.userId !== userId &&
            candidate.status === "active" &&
            candidate.role === "admin",
        );

        if (!otherAdminExists) {
          return {
            outcome: "last-admin",
          };
        }
      }

      const updated = {
        ...membership,
        status: "inactive",
        endedAt: timestamp,
        endedByUserId: userId,
        endReason: "left",
        revision: membership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(updated._id, updated);
      cleanupSubjectSchedule({
        familyId,
        subjectUserId: userId,
        actorUserId: userId,
        timestamp,
      });
      const family = familiesById.get(familyId);
      familiesById.set(familyId, {
        ...family,
        revision: family.revision + 1,
        updatedAt: timestamp,
      });

      return {
        outcome: "updated",
        membership: structuredClone(updated),
      };
    },

    async transferAdminAndLeave({
      familyId,
      userId,
      successorUserId,
      timestamp,
    }) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (membership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const successor = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === successorUserId &&
          candidate.status === "active",
      );

      if (!successor || successor.userId === userId) {
        return {
          outcome: "successor-not-found",
        };
      }

      const updatedSuccessor = {
        ...successor,
        role: "admin",
        revision:
          successor.role === "admin"
            ? successor.revision
            : successor.revision + 1,
        updatedAt:
          successor.role === "admin"
            ? successor.updatedAt
            : timestamp,
      };
      const updatedMembership = {
        ...membership,
        status: "inactive",
        endedAt: timestamp,
        endedByUserId: userId,
        endReason: "left_after_transfer",
        revision: membership.revision + 1,
        updatedAt: timestamp,
      };
      membershipsById.set(
        updatedSuccessor._id,
        updatedSuccessor,
      );
      membershipsById.set(
        updatedMembership._id,
        updatedMembership,
      );
      cleanupSubjectSchedule({
        familyId,
        subjectUserId: userId,
        actorUserId: userId,
        timestamp,
      });
      const family = familiesById.get(familyId);
      familiesById.set(familyId, {
        ...family,
        revision: family.revision + 1,
        updatedAt: timestamp,
      });

      return {
        outcome: "updated",
        membership: structuredClone(updatedMembership),
        successor: structuredClone(updatedSuccessor),
      };
    },

    async dissolveFamily({
      familyId,
      userId,
      confirmationName,
    }) {
      const membership = [...membershipsById.values()].find(
        (candidate) =>
          candidate.familyId === familyId &&
          candidate.userId === userId &&
          candidate.status === "active",
      );

      if (membership?.role !== "admin") {
        return {
          outcome: "admin-required",
        };
      }

      const family = familiesById.get(familyId);

      if (!family) {
        return {
          outcome: "not-found",
        };
      }

      if (family.name !== confirmationName) {
        return {
          outcome: "confirmation-mismatch",
        };
      }

      familiesById.delete(familyId);

      for (const [membershipId, candidate] of membershipsById) {
        if (candidate.familyId === familyId) {
          membershipsById.delete(membershipId);
        }
      }

      for (const [inviteId, invite] of invitesById) {
        if (invite.familyId === familyId) {
          invitesById.delete(inviteId);
        }
      }

      for (const [ruleId, rule] of recurringRulesById) {
        if (rule.familyId === familyId) {
          recurringRulesById.delete(ruleId);
        }
      }

      for (const [reminderId, reminder] of remindersById) {
        if (reminder.familyId === familyId) {
          remindersById.delete(reminderId);
        }
      }

      return {
        outcome: "dissolved",
      };
    },

    async setMembershipStatusForTest(membershipId, status) {
      const membership = membershipsById.get(membershipId);
      membershipsById.set(membershipId, {
        ...membership,
        status,
      });
    },

    async setMembershipRoleForTest(membershipId, role) {
      const membership = membershipsById.get(membershipId);
      membershipsById.set(membershipId, {
        ...membership,
        role,
      });
    },

    async seedRecurringRuleForTest(rule) {
      recurringRulesById.set(rule._id, structuredClone(rule));
    },

    async seedReminderForTest(reminder) {
      remindersById.set(reminder._id, structuredClone(reminder));
    },

    async getRecurringRuleForTest(ruleId) {
      const rule = recurringRulesById.get(ruleId);
      return rule ? structuredClone(rule) : null;
    },

    async getReminderForTest(reminderId) {
      const reminder = remindersById.get(reminderId);
      return reminder ? structuredClone(reminder) : null;
    },
  };
}

module.exports = {
  createInMemoryFamilyStore,
};
