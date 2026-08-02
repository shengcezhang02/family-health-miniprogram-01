function pad(value) {
  return String(value).padStart(2, "0");
}

function toNotificationTimeRows(values) {
  return (values || []).map((value) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error("通知时间数据不正确");
    }

    return {
      date: `${date.getFullYear()}-${pad(
        date.getMonth() + 1,
      )}-${pad(date.getDate())}`,
      time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    };
  });
}

function buildNotificationTimeValues(rows) {
  const timestamps = new Set();

  for (const row of rows || []) {
    const value = new Date(`${row.date}T${row.time}:00`);

    if (Number.isNaN(value.getTime())) {
      throw new Error("请选择有效的通知时间");
    }

    timestamps.add(value.getTime());
  }

  return [...timestamps]
    .sort((left, right) => left - right)
    .map((timestamp) => new Date(timestamp).toISOString());
}

function formatNotificationTimeSummary(values) {
  return (values || [])
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .map(
      (value) =>
        `${value.getMonth() + 1}月${value.getDate()}日 ${pad(
          value.getHours(),
        )}:${pad(value.getMinutes())}`,
    )
    .join("、");
}

module.exports = {
  buildNotificationTimeValues,
  formatNotificationTimeSummary,
  toNotificationTimeRows,
};
