const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRecurringScheduleInput,
  toRecurringFormState,
} = require("../miniprogram/services/recurring-rule-form");

test("周期规则表单把每周日期和每日多个时间规范为稳定顺序", () => {
  const input = buildRecurringScheduleInput({
    startDate: "2026-07-31",
    endDate: "2026-08-31",
    repeatType: "weekly",
    weekdays: [5, 1, 5],
    intervalDays: "",
    dailyTimeRows: [
      {
        time: "20:00",
      },
      {
        time: "08:00",
      },
      {
        time: "08:00",
      },
    ],
  });

  assert.deepEqual(input, {
    startDate: "2026-07-31",
    endDate: "2026-08-31",
    repeat: {
      type: "weekly",
      weekdays: [1, 5],
    },
    dailyTimes: ["08:00", "20:00"],
  });
});

test("已有隔日规则能恢复到统一编辑表单", () => {
  const state = toRecurringFormState({
    startDate: "2026-07-31",
    endDate: "2026-08-31",
    repeat: {
      type: "interval_days",
      intervalDays: 3,
    },
    dailyTimes: ["08:00", "20:00"],
  });

  assert.deepEqual(state, {
    startDate: "2026-07-31",
    endDate: "2026-08-31",
    repeatType: "interval_days",
    repeatTypeIndex: 2,
    weekdays: [],
    intervalDays: "3",
    dailyTimeRows: [
      {
        time: "08:00",
      },
      {
        time: "20:00",
      },
    ],
  });
});
