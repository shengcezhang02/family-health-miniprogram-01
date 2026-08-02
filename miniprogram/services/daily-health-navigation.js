function getReminderCardTarget(reminder) {
  if (reminder?.linkedRecordId) {
    return {
      type: "record",
      id: reminder.linkedRecordId,
    };
  }

  return {
    type: "reminder",
    id: reminder.id,
  };
}

module.exports = {
  getReminderCardTarget,
};
