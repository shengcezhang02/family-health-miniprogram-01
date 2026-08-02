function buildFamilyManagementView({
  family,
  currentUserId,
  members,
}) {
  const isAdmin = family.role === "admin";
  const adminCount = members.filter(
    (member) => member.role === "admin",
  ).length;
  const mustTransferBeforeLeaving =
    isAdmin && adminCount === 1;

  return {
    family,
    isAdmin,
    canInvite: isAdmin,
    canDissolve: isAdmin,
    canDemoteSelf: isAdmin && adminCount > 1,
    mustTransferBeforeLeaving,
    canLeaveDirectly: !mustTransferBeforeLeaving,
    successorOptions: members.filter(
      (member) => member.id !== currentUserId,
    ),
    members: members.map((member) => ({
      ...member,
      avatarText: member.displayName
        ? member.displayName.slice(0, 1)
        : "家",
      canPromote:
        isAdmin &&
        member.id !== currentUserId &&
        member.role === "member",
      canRemove:
        isAdmin &&
        member.id !== currentUserId &&
        member.role === "member",
    })),
  };
}

module.exports = {
  buildFamilyManagementView,
};
