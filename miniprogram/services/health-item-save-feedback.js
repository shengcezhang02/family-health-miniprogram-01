const SAVE_FEEDBACK_BY_MODE = {
  checkIn: {
    title: "打卡成功",
    target: "/pages/daily-health/daily-health",
  },
  reminder: {
    title: "提醒已保存",
    target: "/pages/daily-health/daily-health",
  },
  recurring: {
    title: "周期规则已保存",
    target: "/pages/daily-health/daily-health",
  },
  record: {
    title: "记录已保存",
    target: "/pages/records/records",
  },
};

function completeHealthItemSave({
  mode,
  showToast,
  canNavigateBack = false,
  navigateBack,
  navigateFallback,
  setTimer = setTimeout,
}) {
  const feedback =
    SAVE_FEEDBACK_BY_MODE[mode] || SAVE_FEEDBACK_BY_MODE.record;

  showToast({
    title: feedback.title,
    icon: "success",
    duration: 1200,
  });

  return new Promise((resolve) => {
    setTimer(() => {
      if (canNavigateBack && typeof navigateBack === "function") {
        navigateBack();
      } else {
        navigateFallback(feedback.target);
      }
      resolve();
    }, 700);
  });
}

module.exports = {
  completeHealthItemSave,
};
