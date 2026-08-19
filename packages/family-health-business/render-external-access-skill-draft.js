const {
  EXTERNAL_ACCESS_ACTIONS,
} = require("./external-access-policy");

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
  const readActionNames = Object.entries(EXTERNAL_ACCESS_ACTIONS)
    .filter(([, definition]) => definition.mode === "read")
    .map(([action]) => `- \`${action}\``)
    .join("\n");
  const writeActionNames = Object.entries(EXTERNAL_ACCESS_ACTIONS)
    .filter(([, definition]) => definition.mode === "write")
    .map(([action]) => `- \`${action}\``)
    .join("\n");

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

## 已可用的只读动作

${readActionNames}

### 1. 获取全部家庭上下文

先调用 \`getContext\`，从结果取得真实的 \`familyId\`、\`subjectUserId\` 和模板 ID。返回的家庭都表示令牌所有者仍是该家庭的有效成员，因此可以读取同一家庭所有成员的日常健康数据；不需要等待其他成员逐人确认。

\`\`\`bash
curl -X POST "${safeBaseUrl}/v1/action" \\
  -H "Authorization: Bearer ${safeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"getContext","requestId":"agent-context-001","payload":{}}'
\`\`\`

### 2. 读取指定家庭模板

\`\`\`bash
curl -X POST "${safeBaseUrl}/v1/action" \\
  -H "Authorization: Bearer ${safeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"listTemplates","requestId":"agent-templates-001","payload":{"familyId":"<familyId>"}}'
\`\`\`

### 3. 分页读取健康事项

\`itemType\` 只能是 \`record\`、\`reminder\` 或 \`recurring_rule\`。可选筛选只有 \`subjectUserId\`、\`templateType\`、\`templateId\`、\`from\`、\`to\`、\`cursor\`、\`limit\`；\`limit\` 默认 50，最大 100。

\`\`\`bash
curl -X POST "${safeBaseUrl}/v1/action" \\
  -H "Authorization: Bearer ${safeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"listHealthItems","requestId":"agent-records-001","payload":{"familyId":"<familyId>","itemType":"record","subjectUserId":"<subjectUserId>","from":"2026-08-01T00:00:00+08:00","to":"2026-08-31T23:59:59+08:00","limit":50}}'
\`\`\`

如果响应包含 \`nextCursor\`，下一页保持其他筛选不变，并把该值原样放进 \`cursor\`。不要自行构造或修改游标。

### 4. 读取一条健康事项

\`\`\`bash
curl -X POST "${safeBaseUrl}/v1/action" \\
  -H "Authorization: Bearer ${safeToken}" \\
  -H "Content-Type: application/json" \\
  -d '{"action":"getHealthItem","requestId":"agent-item-001","payload":{"familyId":"<familyId>","itemType":"record","itemId":"<itemId>"}}'
\`\`\`

## 已可用的写入动作

所有动作都已开放：

${writeActionNames}

所有写入都使用上面的 POST 地址和请求头，只替换 JSON 请求体。时间须为带时区的 ISO 8601；日期为 \`YYYY-MM-DD\`；每日时间为 \`HH:mm\`。

### 创建记录

\`\`\`json
{"action":"createRecord","requestId":"agent-create-record-001","payload":{"familyId":"<familyId>","subjectUserId":"<subjectUserId>","sourceTemplateType":"system","sourceTemplateId":"sys_temperature","occurredAt":"2026-08-19T08:30:00+08:00","values":{"temperature":36.7},"remark":"AI 代为录入"}}
\`\`\`

### 创建提醒和周期规则

\`\`\`json
{"action":"createReminder","requestId":"agent-create-reminder-001","payload":{"familyId":"<familyId>","subjectUserId":"<subjectUserId>","sourceTemplateId":"sys_temperature","plannedAt":"2026-08-19T20:00:00+08:00","notificationTimes":["2026-08-19T19:50:00+08:00"],"values":{},"remark":"晚间测量"}}
\`\`\`

\`\`\`json
{"action":"createRecurringRule","requestId":"agent-create-rule-001","payload":{"familyId":"<familyId>","subjectUserId":"<subjectUserId>","sourceTemplateId":"sys_temperature","values":{},"startDate":"2026-08-19","endDate":"2026-12-31","repeat":{"type":"daily"},"dailyTimes":["08:00"]}}
\`\`\`

周期规则的 \`repeat\` 支持 \`{"type":"daily"}\`、\`{"type":"weekly","weekdays":[1,3,5]}\` 和 \`{"type":"interval_days","intervalDays":2}\`。这里 \`intervalDays:2\` 表示每隔一天执行一次。

### 修改、打卡、暂停、恢复和软删除

先用 \`getHealthItem\` 取得最新 \`revision\`，再把它作为 \`expectedRevision\`。记录修改可提交 \`occurredAt\`、\`values\`、\`remark\`；提醒可提交 \`plannedAt\`、\`notificationTimes\`、\`values\`、\`remark\`；周期规则可提交 \`startDate\`、\`endDate\`、\`repeat\`、\`dailyTimes\`、\`values\`、\`remark\`。

\`\`\`json
{"action":"updateHealthItem","requestId":"agent-update-item-001","payload":{"itemType":"record","itemId":"<itemId>","expectedRevision":1,"occurredAt":"2026-08-19T08:35:00+08:00","values":{"temperature":36.8},"remark":"复测"}}
\`\`\`

\`\`\`json
{"action":"checkInReminder","requestId":"agent-check-in-001","payload":{"itemType":"reminder","itemId":"<reminderId>","expectedRevision":1,"occurredAt":"2026-08-19T20:02:00+08:00","values":{"temperature":36.6}}}
\`\`\`

\`\`\`json
{"action":"pauseRule","requestId":"agent-pause-001","payload":{"itemType":"recurring_rule","itemId":"<ruleId>","expectedRevision":1}}
\`\`\`

\`resumeRule\` 使用与 \`pauseRule\` 相同的 payload；\`softDeleteItem\` 使用 \`itemType\`、\`itemId\`、\`expectedRevision\`。删除只进入回收站，令牌不能读取、恢复或永久删除回收站内容。

### 管理模板

- \`createCustomTemplate\`：\`familyId\`、\`name\`、可选 \`colorKey\` 或 \`colorHex\`、\`fields\`。
- \`updateCustomTemplate\`：再加 \`templateId\` 和 \`expectedRevision\`；字段历史约束仍然有效。
- \`setTemplateStatus\`：\`familyId\`、\`templateId\`、\`expectedRevision\`、\`status\`（\`active\` 或 \`inactive\`）。
- \`copySystemTemplate\`：\`familyId\`、\`systemTemplateId\`，可选新名称和颜色。
- \`updateSystemTemplateSettings\`：\`familyId\`、\`systemTemplateId\`、\`expectedRevision\`、\`status\`、\`sortOrder\`。这里的 \`expectedRevision\` 必须使用 \`getContext\` 返回的家庭 \`revision\` 或 \`listTemplates\` 返回的 \`familyRevision\`。

\`\`\`json
{"action":"createCustomTemplate","requestId":"agent-template-001","payload":{"familyId":"<familyId>","name":"血氧","colorHex":"#4E8D86","fields":[{"label":"血氧饱和度","type":"number","unit":"%","required":true}]}}
\`\`\`

## 必须遵守

- 只使用 HTTPS；不得跳过 TLS 证书校验。
- 操作前先调用 \`getContext\` 获取真实家庭、成员和模板 ID。
- 只能使用 \`getContext\` 返回的家庭；令牌所有者退出家庭后，该家庭立即不可再访问。
- 修改前先读取对象并提交 \`expectedRevision\`。
- 同一写动作重试必须复用同一个 \`requestId\`。
- 收到 \`REVISION_CONFLICT\` 后重新读取，再判断是否仍需修改；不要盲目覆盖。
- 不得尝试访问、恢复、修改或永久删除回收站内容。
- 不得管理家庭成员、角色、邀请、健康档案或家庭解散。
`;
}

module.exports = {
  renderExternalAccessSkillDraft,
};
