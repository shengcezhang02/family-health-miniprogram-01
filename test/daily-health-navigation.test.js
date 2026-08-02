const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getReminderCardTarget,
} = require("../miniprogram/services/daily-health-navigation");

test("点击待打卡提醒进入提醒编辑，点击已打卡提醒进入对应记录", () => {
  assert.deepEqual(
    getReminderCardTarget({
      id: "reminder-pending",
      status: "pending",
    }),
    {
      type: "reminder",
      id: "reminder-pending",
    },
  );
  assert.deepEqual(
    getReminderCardTarget({
      id: "reminder-completed",
      status: "completed",
      linkedRecordId: "record-1",
    }),
    {
      type: "record",
      id: "record-1",
    },
  );
});
