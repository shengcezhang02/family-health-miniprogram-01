const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildNotificationTimeValues,
  formatNotificationTimeSummary,
  toNotificationTimeRows,
} = require("../miniprogram/services/reminder-notification-times");

test("通知时间按先后排序并去重", () => {
  const result = buildNotificationTimeValues([
    {
      date: "2026-07-30",
      time: "08:30",
    },
    {
      date: "2026-07-29",
      time: "21:00",
    },
    {
      date: "2026-07-30",
      time: "08:30",
    },
  ]);

  assert.deepEqual(
    result.map((value) => new Date(value).getTime()),
    [
      new Date("2026-07-29T21:00:00").getTime(),
      new Date("2026-07-30T08:30:00").getTime(),
    ],
  );
});

test("已有通知时间可以恢复为日期和时间选择器数据", () => {
  const values = [
    new Date(2026, 6, 30, 8, 5).toISOString(),
    new Date(2026, 6, 29, 21, 0).toISOString(),
  ];

  assert.deepEqual(toNotificationTimeRows(values), [
    {
      date: "2026-07-30",
      time: "08:05",
    },
    {
      date: "2026-07-29",
      time: "21:00",
    },
  ]);
});

test("提醒条目把多个通知时间整理为一行可截断的文字", () => {
  const values = [
    new Date(2026, 6, 31, 7, 45).toISOString(),
    new Date(2026, 6, 31, 7, 55).toISOString(),
    new Date(2026, 6, 31, 8, 5).toISOString(),
  ];

  assert.equal(
    formatNotificationTimeSummary(values),
    "7月31日 07:45、7月31日 07:55、7月31日 08:05",
  );
});
