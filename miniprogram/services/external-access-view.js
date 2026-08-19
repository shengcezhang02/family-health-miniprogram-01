const ACTION_LABELS = Object.freeze({
  getContext: "读取家庭信息",
  listHealthItems: "读取健康事项",
  getHealthItem: "读取一条健康事项",
  listTemplates: "读取模板",
  createRecord: "添加健康记录",
  createReminder: "添加一次性提醒",
  createRecurringRule: "添加周期规则",
  updateHealthItem: "修改健康事项",
  checkInReminder: "打卡提醒",
  pauseRule: "暂停周期规则",
  resumeRule: "恢复周期规则",
  softDeleteItem: "移入回收站",
  createCustomTemplate: "添加自定义模板",
  updateCustomTemplate: "修改自定义模板",
  setTemplateStatus: "启用或停用模板",
  copySystemTemplate: "复制系统模板",
  updateSystemTemplateSettings: "修改系统模板设置",
});

const RESOURCE_LABELS = Object.freeze({
  record: "记录",
  reminder: "一次性提醒",
  recurring_rule: "周期规则",
  template: "模板",
});

const RESULT_LABELS = Object.freeze({
  OK: ["成功", "success"],
  REVISION_CONFLICT: ["数据已变化", "warning"],
  FAMILY_ACCESS_DENIED: ["家庭权限已变化", "warning"],
  FAMILY_EXTERNAL_ACCESS_NOT_READY: ["家庭尚未确认权限", "warning"],
  INVALID_VALUES: ["输入内容有误", "warning"],
  RATE_LIMITED: ["调用过于频繁", "warning"],
  SERVICE_NOT_READY: ["功能仍在接入", "quiet"],
});

function defaultFormatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createExternalAccessView({
  formatDateTime = defaultFormatDateTime,
} = {}) {
  function toTokenItem(token) {
    return {
      ...token,
      credentialHint: `…${token.secretHint}`,
      createdAtText: formatDateTime(token.createdAt),
      lastUsedText: token.lastUsedAt
        ? formatDateTime(token.lastUsedAt)
        : "尚未使用",
      revokedAtText: token.revokedAt
        ? formatDateTime(token.revokedAt)
        : "",
    };
  }

  return {
    groupTokens(tokens = []) {
      return {
        active: tokens
          .filter((token) => token.status === "active")
          .map(toTokenItem),
        revoked: tokens
          .filter((token) => token.status === "revoked")
          .map(toTokenItem),
      };
    },

    toAccessItem(access) {
      const result = RESULT_LABELS[access.resultCode] || [
        access.ok ? "成功" : "未完成",
        access.ok ? "success" : "warning",
      ];
      const context = [
        access.familyName,
        RESOURCE_LABELS[access.resourceType] || access.resourceType,
        access.resourceName,
      ].filter(Boolean);

      return {
        id: access.id,
        actionText:
          ACTION_LABELS[access.action] || "访问家庭健康数据",
        contextText: context.length ? context.join(" · ") : "全部家庭",
        resultText: result[0],
        resultTone: result[1],
        accessedAtText: formatDateTime(access.accessedAt),
      };
    },
  };
}

module.exports = {
  createExternalAccessView,
};
