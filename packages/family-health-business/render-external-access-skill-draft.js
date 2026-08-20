function validateBaseUrl(baseUrl) {
  let parsed;

  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError("请提供有效的 HTTPS 地址");
  }

  if (parsed.protocol !== "https:") {
    throw new TypeError("外部访问地址必须使用 HTTPS");
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new TypeError("外部访问地址不能包含凭据、查询参数或片段");
  }

  return parsed.toString().replace(/\/$/, "");
}

function validateToken(token) {
  if (
    typeof token !== "string" ||
    !/^fhp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  ) {
    throw new TypeError("请提供有效的家庭健康访问令牌");
  }

  return token;
}

function renderExternalAccessSkillDraft({ baseUrl, token } = {}) {
  const safeBaseUrl = validateBaseUrl(baseUrl);
  const safeToken = validateToken(token);

  return `---
name: family-health-api
description: 使用 curl 读取和管理家庭健康记录、提醒、周期规则与模板。
---

# Family Health API

Base URL: ${safeBaseUrl}
Authorization token: ${safeToken}

> 此 Skill 包含永久访问令牌。不得上传到公开仓库、共享文档或不可信服务。

## 调用格式

\`\`\`bash
curl -X POST "${safeBaseUrl}/v1/action" \\
  -H "Authorization: Bearer ${safeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"getContext","requestId":"agent-example-001","payload":{}}'
\`\`\`

## 使用顺序

先调用 \`getContext\` 获取可用 ID 和模板字段。只使用接口返回的 ID，不要猜测。

## 读取

- \`getContext\`：\`payload: {}\`。
- \`listTemplates\`：\`payload: {"familyId":"<familyId>"}\`。
- \`listHealthItems\`：必填 \`familyId\`、\`itemType\`；\`itemType\` 为 \`record\`、\`reminder\` 或 \`recurring_rule\`。可选 \`subjectUserId\`、\`templateType\`、\`templateId\`、\`from\`、\`to\`、\`cursor\`、\`limit\`。
- \`getHealthItem\`：必填 \`familyId\`、\`itemType\`、\`itemId\`。

\`limit\` 默认 50、最大 100。响应有 \`nextCursor\` 时，下一页保持筛选不变并原样提交该 \`cursor\`。

## 写入

所有写入都使用上面的 POST 地址和请求头，只替换 JSON 请求体。时间须为带时区的 ISO 8601；日期为 \`YYYY-MM-DD\`；每日时间为 \`HH:mm\`。

### 创建记录

\`\`\`json
{"action":"createRecord","requestId":"agent-create-record-001","payload":{"familyId":"<familyId>","subjectUserId":"<subjectUserId>","sourceTemplateType":"system","sourceTemplateId":"sys_temperature","occurredAt":"2026-08-19T08:30:00+08:00","values":{"temperature":36.7},"remark":"AI 代为录入"}}
\`\`\`

### 创建提醒和周期规则

- \`createReminder\`：\`familyId\`、\`subjectUserId\`、\`sourceTemplateId\`、\`plannedAt\`、\`notificationTimes\`、\`values\`，可选 \`remark\`。
- \`createRecurringRule\`：模板和目标 ID、\`startDate\`、\`endDate\`、\`repeat\`、\`dailyTimes\`、\`values\`，可选 \`remark\`。

周期规则的 \`repeat\` 支持 \`{"type":"daily"}\`、\`{"type":"weekly","weekdays":[1,3,5]}\` 和 \`{"type":"interval_days","intervalDays":2}\`。这里 \`intervalDays:2\` 表示每隔一天执行一次。

### 修改、打卡、暂停、恢复和软删除

先用 \`getHealthItem\` 取得最新 \`revision\`，再把它作为 \`expectedRevision\`。记录修改可提交 \`occurredAt\`、\`values\`、\`remark\`；提醒可提交 \`plannedAt\`、\`notificationTimes\`、\`values\`、\`remark\`；周期规则可提交 \`startDate\`、\`endDate\`、\`repeat\`、\`dailyTimes\`、\`values\`、\`remark\`。

\`\`\`json
{"action":"updateHealthItem","requestId":"agent-update-item-001","payload":{"itemType":"record","itemId":"<itemId>","expectedRevision":1,"occurredAt":"2026-08-19T08:35:00+08:00","values":{"temperature":36.8},"remark":"复测"}}
\`\`\`

- \`checkInReminder\`：提醒的 \`itemId\`、\`expectedRevision\`、\`occurredAt\`、\`values\`，可选 \`remark\`。
- \`pauseRule\`、\`resumeRule\`：规则的 \`itemId\` 和 \`expectedRevision\`。
- \`softDeleteItem\`：\`itemType\`、\`itemId\`、\`expectedRevision\`。仅执行软删除。

### 管理模板

- \`createCustomTemplate\`：\`familyId\`、\`name\`、可选 \`colorKey\` 或 \`colorHex\`、\`fields\`。
- \`updateCustomTemplate\`：再加 \`templateId\` 和 \`expectedRevision\`；字段历史约束仍然有效。
- \`setTemplateStatus\`：\`familyId\`、\`templateId\`、\`expectedRevision\`、\`status\`（\`active\` 或 \`inactive\`）。
- \`copySystemTemplate\`：\`familyId\`、\`systemTemplateId\`，可选新名称和颜色。
- \`updateSystemTemplateSettings\`：\`familyId\`、\`systemTemplateId\`、\`expectedRevision\`、\`status\`、\`sortOrder\`。版本取自家庭 \`revision\` 或 \`familyRevision\`。

## 必须遵守

- 只使用 HTTPS；不得跳过 TLS 证书校验。
- 先调用 \`getContext\`，只使用接口返回的 ID 和模板字段。
- 修改前先读取对象并提交 \`expectedRevision\`。
- 同一写动作重试必须复用同一个 \`requestId\`。
- 收到 \`REVISION_CONFLICT\` 后重新读取，再判断是否仍需修改；不要盲目覆盖。
- 不得尝试访问、恢复、修改或永久删除回收站内容。
- 不得调用本文未列出的动作。
`;
}

module.exports = {
  renderExternalAccessSkillDraft,
};
