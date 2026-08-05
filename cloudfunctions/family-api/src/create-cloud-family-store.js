function createCloudFamilyStore(db) {
  const users = db.collection("users");
  const families = db.collection("families");
  const memberships = db.collection("family_memberships");
  const invites = db.collection("family_invites");

  function withoutDocumentId(document) {
    const { _id, ...data } = document;
    return data;
  }

  async function listActiveMembershipsInTransaction(
    transaction,
    familyId,
  ) {
    const result = await transaction
      .collection("family_memberships")
      .where({
        familyId,
        status: "active",
      })
      .get();
    return result.data;
  }

  async function incrementFamilyRevision(
    transaction,
    familyId,
    timestamp,
  ) {
    const transactionFamilies = transaction.collection("families");
    const result = await transactionFamilies.doc(familyId).get();
    const family = result.data ?? null;

    if (!family) {
      return null;
    }

    const updated = {
      ...family,
      revision: family.revision + 1,
      updatedAt: timestamp,
    };
    await transactionFamilies.doc(familyId).set({
      data: withoutDocumentId(updated),
    });
    return updated;
  }

  async function cleanupSubjectScheduleInTransaction({
    transaction,
    familyId,
    subjectUserId,
    actorUserId,
    timestamp,
  }) {
    const transactionRules =
      transaction.collection("recurring_rules");
    const ruleResult = await transactionRules
      .where({
        familyId,
        subjectUserId,
        status: "active",
      })
      .get();

    for (const rule of ruleResult.data) {
      if (rule.deletedAt) {
        continue;
      }

      const pausedRule = {
        ...rule,
        status: "paused",
        pausedAt: timestamp,
        pausedByUserId: actorUserId,
        pauseReason: "subject_inactive",
        updatedByUserId: actorUserId,
        updatedAt: timestamp,
        revision: rule.revision + 1,
      };
      await transactionRules.doc(rule._id).set({
        data: withoutDocumentId(pausedRule),
      });
      const transactionReminders = transaction.collection(
        "one_time_reminders",
      );
      const reminderResult = await transactionReminders
        .where({
          familyId,
          sourceRecurringRuleId: rule._id,
          status: "pending",
        })
        .get();

      for (const reminder of reminderResult.data) {
        if (
          !reminder.deletedAt &&
          new Date(reminder.plannedAt).getTime() >
            timestamp.getTime()
        ) {
          await transactionReminders
            .doc(reminder._id)
            .remove();
        }
      }
    }
  }

  async function getUserByOpenId(openId) {
    const result = await users.where({ wechatOpenId: openId }).limit(1).get();
    return result.data[0] ?? null;
  }

  async function findOne(collection, query) {
    const result = await collection.where(query).limit(1).get();
    return result.data[0] ?? null;
  }

  return {
    getUserByOpenId,

    async createUser(user) {
      try {
        await users.doc(user._id).set({
          data: withoutDocumentId(user),
        });
        return user;
      } catch (error) {
        const existingUser = await getUserByOpenId(user.wechatOpenId);

        if (existingUser) {
          return existingUser;
        }

        throw error;
      }
    },

    async createFamilyWithAdmin({ family, membership }) {
      await db.runTransaction(async (transaction) => {
        await transaction.collection("families").doc(family._id).set({
          data: withoutDocumentId(family),
        });
        await transaction
          .collection("family_memberships")
          .doc(membership._id)
          .set({
            data: withoutDocumentId(membership),
          });
      });
    },

    async listActiveFamiliesByUserId(userId) {
      const membershipResult = await memberships
        .where({
          userId,
          status: "active",
        })
        .get();

      const results = await Promise.all(
        membershipResult.data.map(async (membership) => {
          const familyResult = await families.doc(membership.familyId).get();

          if (!familyResult.data) {
            return null;
          }

          return {
            family: familyResult.data,
            membership,
          };
        }),
      );

      return results.filter(Boolean);
    },

    async getActiveMembership(familyId, userId) {
      return findOne(memberships, {
        familyId,
        userId,
        status: "active",
      });
    },

    async createInvite(invite) {
      await invites.doc(invite._id).set({
        data: withoutDocumentId(invite),
      });
      return invite;
    },

    async getInviteByTokenHash(tokenHash) {
      return findOne(invites, { tokenHash });
    },

    async getInviteByCredential(inviteQuery) {
      return findOne(invites, inviteQuery);
    },

    async getFamilyById(familyId) {
      return findOne(families, { _id: familyId });
    },

    async getUserById(userId) {
      return findOne(users, { _id: userId });
    },

    async updateUserDisplayName({ userId, displayName, timestamp }) {
      return db.runTransaction(async (transaction) => {
        const transactionUsers = transaction.collection("users");
        const result = await transactionUsers.doc(userId).get();
        const user = result.data ?? null;

        if (!user) {
          return null;
        }

        const updated = {
          ...user,
          displayName,
          revision: user.revision + 1,
          updatedAt: timestamp,
        };
        await transactionUsers.doc(userId).set({
          data: withoutDocumentId(updated),
        });
        return updated;
      });
    },

    async joinFamilyWithInvite({
      inviteQuery,
      userId,
      profileManagementAllowed,
      displayName,
      membershipId,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const transactionUsers = transaction.collection("users");
        const userResult = displayName
          ? await transactionUsers.doc(userId).get()
          : { data: null };
        const user = userResult.data ?? null;
        const renamedUser = user
          ? {
              ...user,
              displayName,
              revision: user.revision + 1,
              updatedAt: timestamp,
            }
          : null;
        const inviteResult = await transaction
          .collection("family_invites")
          .where(inviteQuery)
          .limit(1)
          .get();
        const invite = inviteResult.data[0] ?? null;
        const membershipResult = invite
          ? await transaction
              .collection("family_memberships")
              .where({
                familyId: invite.familyId,
                userId,
              })
              .limit(1)
              .get()
          : { data: [] };
        const existingMembership = membershipResult.data[0] ?? null;

        if (
          invite?.status === "used" &&
          invite.usedByUserId === userId &&
          existingMembership?.status === "active"
        ) {
          const familyResult = await transaction
            .collection("families")
            .doc(invite.familyId)
            .get();
          if (renamedUser) {
            await transactionUsers.doc(userId).set({
              data: withoutDocumentId(renamedUser),
            });
          }
          return {
            family: familyResult.data,
            membership: existingMembership,
            ...(renamedUser ? { user: renamedUser } : {}),
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
              _id: existingMembership._id,
              familyId: invite.familyId,
              userId,
              role: "member",
              status: "active",
              profileManagementAllowed,
              joinedAt: timestamp,
              revision: existingMembership.revision + 1,
              createdAt: existingMembership.createdAt,
              updatedAt: timestamp,
            }
          : {
              _id: membershipId,
              familyId: invite.familyId,
              userId,
              role: "member",
              status: "active",
              profileManagementAllowed,
              joinedAt: timestamp,
              revision: 1,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
        const usedInvite = {
          ...invite,
          status: "used",
          usedByUserId: userId,
          usedAt: timestamp,
          revision: invite.revision + 1,
          updatedAt: timestamp,
        };

        await transaction
          .collection("family_memberships")
          .doc(membership._id)
          .set({
            data: withoutDocumentId(membership),
          });
        await transaction
          .collection("family_invites")
          .doc(invite._id)
          .set({
            data: withoutDocumentId(usedInvite),
          });
        if (renamedUser) {
          await transactionUsers.doc(userId).set({
            data: withoutDocumentId(renamedUser),
          });
        }
        const familyResult = await transaction
          .collection("families")
          .doc(invite.familyId)
          .get();

        return {
          family: familyResult.data,
          membership,
          ...(renamedUser ? { user: renamedUser } : {}),
        };
      });
    },

    async revokeInviteAsAdmin({ inviteId, userId, timestamp }) {
      return db.runTransaction(async (transaction) => {
        const inviteResult = await transaction
          .collection("family_invites")
          .where({ _id: inviteId })
          .limit(1)
          .get();
        const invite = inviteResult.data[0] ?? null;

        if (
          !invite ||
          invite.status !== "active" ||
          invite.expiresAt.getTime() <= timestamp.getTime()
        ) {
          return {
            outcome: "unavailable",
          };
        }

        const membershipResult = await transaction
          .collection("family_memberships")
          .where({
            familyId: invite.familyId,
            userId,
            status: "active",
          })
          .limit(1)
          .get();
        const membership = membershipResult.data[0] ?? null;

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
        await transaction
          .collection("family_invites")
          .doc(invite._id)
          .set({
            data: withoutDocumentId(revokedInvite),
          });

        return {
          outcome: "revoked",
          invite: revokedInvite,
        };
      });
    },

    async promoteMemberToAdmin({
      familyId,
      callerUserId,
      targetUserId,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const callerMembership = activeMemberships.find(
          (candidate) => candidate.userId === callerUserId,
        );

        if (callerMembership?.role !== "admin") {
          return {
            outcome: "admin-required",
          };
        }

        const targetMembership = activeMemberships.find(
          (candidate) => candidate.userId === targetUserId,
        );

        if (!targetMembership) {
          return {
            outcome: "not-found",
          };
        }

        if (targetMembership.role === "admin") {
          return {
            outcome: "updated",
            membership: targetMembership,
          };
        }

        const updated = {
          ...targetMembership,
          role: "admin",
          revision: targetMembership.revision + 1,
          updatedAt: timestamp,
        };
        await transaction
          .collection("family_memberships")
          .doc(updated._id)
          .set({
            data: withoutDocumentId(updated),
          });
        await incrementFamilyRevision(
          transaction,
          familyId,
          timestamp,
        );

        return {
          outcome: "updated",
          membership: updated,
        };
      });
    },

    async demoteSelfFromAdmin({ familyId, userId, timestamp }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const membership = activeMemberships.find(
          (candidate) => candidate.userId === userId,
        );

        if (membership?.role !== "admin") {
          return {
            outcome: "admin-required",
          };
        }

        const otherAdminExists = activeMemberships.some(
          (candidate) =>
            candidate.userId !== userId &&
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
        await transaction
          .collection("family_memberships")
          .doc(updated._id)
          .set({
            data: withoutDocumentId(updated),
          });
        await incrementFamilyRevision(
          transaction,
          familyId,
          timestamp,
        );

        return {
          outcome: "updated",
          membership: updated,
        };
      });
    },

    async leaveFamily({ familyId, userId, timestamp }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const membership = activeMemberships.find(
          (candidate) => candidate.userId === userId,
        );

        if (!membership) {
          return {
            outcome: "not-found",
          };
        }

        if (
          membership.role === "admin" &&
          !activeMemberships.some(
            (candidate) =>
              candidate.userId !== userId &&
              candidate.role === "admin",
          )
        ) {
          return {
            outcome: "last-admin",
          };
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
        await transaction
          .collection("family_memberships")
          .doc(updated._id)
          .set({
            data: withoutDocumentId(updated),
          });
        await cleanupSubjectScheduleInTransaction({
          transaction,
          familyId,
          subjectUserId: userId,
          actorUserId: userId,
          timestamp,
        });
        await incrementFamilyRevision(
          transaction,
          familyId,
          timestamp,
        );

        return {
          outcome: "updated",
          membership: updated,
        };
      });
    },

    async removeMember({
      familyId,
      callerUserId,
      targetUserId,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const callerMembership = activeMemberships.find(
          (candidate) => candidate.userId === callerUserId,
        );

        if (callerMembership?.role !== "admin") {
          return {
            outcome: "admin-required",
          };
        }

        const targetMembership = activeMemberships.find(
          (candidate) => candidate.userId === targetUserId,
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
        await transaction
          .collection("family_memberships")
          .doc(updated._id)
          .set({
            data: withoutDocumentId(updated),
          });
        await cleanupSubjectScheduleInTransaction({
          transaction,
          familyId,
          subjectUserId: targetUserId,
          actorUserId: callerUserId,
          timestamp,
        });
        await incrementFamilyRevision(
          transaction,
          familyId,
          timestamp,
        );

        return {
          outcome: "updated",
          membership: updated,
        };
      });
    },

    async transferAdminAndLeave({
      familyId,
      userId,
      successorUserId,
      timestamp,
    }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const membership = activeMemberships.find(
          (candidate) => candidate.userId === userId,
        );

        if (membership?.role !== "admin") {
          return {
            outcome: "admin-required",
          };
        }

        const successor = activeMemberships.find(
          (candidate) =>
            candidate.userId === successorUserId &&
            candidate.userId !== userId,
        );

        if (!successor) {
          return {
            outcome: "successor-not-found",
          };
        }

        const updatedSuccessor =
          successor.role === "admin"
            ? successor
            : {
                ...successor,
                role: "admin",
                revision: successor.revision + 1,
                updatedAt: timestamp,
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
        const transactionMemberships =
          transaction.collection("family_memberships");

        if (successor.role !== "admin") {
          await transactionMemberships
            .doc(updatedSuccessor._id)
            .set({
              data: withoutDocumentId(updatedSuccessor),
            });
        }

        await transactionMemberships
          .doc(updatedMembership._id)
          .set({
            data: withoutDocumentId(updatedMembership),
          });
        await cleanupSubjectScheduleInTransaction({
          transaction,
          familyId,
          subjectUserId: userId,
          actorUserId: userId,
          timestamp,
        });
        await incrementFamilyRevision(
          transaction,
          familyId,
          timestamp,
        );

        return {
          outcome: "updated",
          membership: updatedMembership,
          successor: updatedSuccessor,
        };
      });
    },

    async dissolveFamily({
      familyId,
      userId,
      confirmationName,
    }) {
      return db.runTransaction(async (transaction) => {
        const activeMemberships =
          await listActiveMembershipsInTransaction(
            transaction,
            familyId,
          );
        const membership = activeMemberships.find(
          (candidate) => candidate.userId === userId,
        );

        if (membership?.role !== "admin") {
          return {
            outcome: "admin-required",
          };
        }

        const transactionFamilies =
          transaction.collection("families");
        const familyResult = await transactionFamilies
          .doc(familyId)
          .get();
        const family = familyResult.data ?? null;

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

        const familyScopedCollections = [
          "family_memberships",
          "family_invites",
          "health_templates",
          "health_records",
          "one_time_reminders",
          "recurring_rules",
          "care_shares",
          "operation_tasks",
        ];

        for (const collectionName of familyScopedCollections) {
          const collection =
            transaction.collection(collectionName);
          const result = await collection
            .where({
              familyId,
            })
            .get();

          for (const document of result.data) {
            await collection.doc(document._id).remove();
          }
        }

        await transactionFamilies.doc(familyId).remove();

        return {
          outcome: "dissolved",
        };
      });
    },
  };
}

module.exports = {
  createCloudFamilyStore,
};
