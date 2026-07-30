function pad(value) {
  return String(value).padStart(2, "0");
}

function toLocalDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function shiftDailyDate(value, amount) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + amount);
  return toLocalDateString(date);
}

function getDailyDatePresentation(value, todayValue) {
  const date = parseLocalDate(value);
  const weekday = [
    "周日",
    "周一",
    "周二",
    "周三",
    "周四",
    "周五",
    "周六",
  ][date.getDay()];
  const shortDate = `${date.getMonth() + 1}月${date.getDate()}日`;

  return value === todayValue
    ? {
        title: "今天",
        subtitle: `${shortDate} · ${weekday}`,
      }
    : {
        title: shortDate,
        subtitle: weekday,
      };
}

module.exports = {
  getDailyDatePresentation,
  shiftDailyDate,
  toLocalDateString,
};
