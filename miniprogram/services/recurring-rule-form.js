const REPEAT_TYPES = [
  {
    value: "daily",
    label: "每天",
  },
  {
    value: "weekly",
    label: "每周指定日期",
  },
  {
    value: "interval_days",
    label: "每隔几天",
  },
];

function buildRecurringScheduleInput({
  startDate,
  endDate,
  repeatType,
  weekdays = [],
  intervalDays,
  dailyTimeRows = [],
}) {
  if (!startDate || !endDate || startDate > endDate) {
    throw new Error("请选择正确的开始和结束日期");
  }

  let repeat;

  if (repeatType === "daily") {
    repeat = {
      type: "daily",
    };
  } else if (repeatType === "weekly") {
    const normalizedWeekdays = [...new Set(weekdays)].sort(
      (left, right) => left - right,
    );

    if (normalizedWeekdays.length === 0) {
      throw new Error("请至少选择一个星期");
    }

    repeat = {
      type: "weekly",
      weekdays: normalizedWeekdays,
    };
  } else if (repeatType === "interval_days") {
    const normalizedIntervalDays = Number(intervalDays);

    if (
      !Number.isInteger(normalizedIntervalDays) ||
      normalizedIntervalDays < 1
    ) {
      throw new Error("每隔天数必须是正整数");
    }

    repeat = {
      type: "interval_days",
      intervalDays: normalizedIntervalDays,
    };
  } else {
    throw new Error("请选择重复方式");
  }

  const dailyTimes = [
    ...new Set(
      dailyTimeRows
        .map((row) => row.time)
        .filter((time) =>
          /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time || ""),
        ),
    ),
  ].sort();

  if (dailyTimes.length === 0) {
    throw new Error("请至少设置一个每日提醒时间");
  }

  return {
    startDate,
    endDate,
    repeat,
    dailyTimes,
  };
}

function toRecurringFormState(rule) {
  const repeatTypeIndex = Math.max(
    REPEAT_TYPES.findIndex(
      (repeatType) => repeatType.value === rule.repeat.type,
    ),
    0,
  );

  return {
    startDate: rule.startDate,
    endDate: rule.endDate,
    repeatType: rule.repeat.type,
    repeatTypeIndex,
    weekdays:
      rule.repeat.type === "weekly"
        ? [...rule.repeat.weekdays]
        : [],
    intervalDays:
      rule.repeat.type === "interval_days"
        ? String(rule.repeat.intervalDays)
        : "",
    dailyTimeRows: rule.dailyTimes.map((time) => ({
      time,
    })),
  };
}

module.exports = {
  REPEAT_TYPES,
  buildRecurringScheduleInput,
  toRecurringFormState,
};
