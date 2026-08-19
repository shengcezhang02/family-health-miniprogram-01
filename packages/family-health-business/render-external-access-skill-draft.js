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
  const actionNames = Object.keys(EXTERNAL_ACCESS_ACTIONS)
    .map((action) => `- \`${action}\``)
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

## 允许动作

${actionNames}

## 必须遵守

- 只使用 HTTPS；不得跳过 TLS 证书校验。
- 操作前先调用 \`getContext\` 获取真实家庭、成员和模板 ID。
- 修改前先读取对象并提交 \`expectedRevision\`。
- 同一写动作重试必须复用同一个 \`requestId\`。
- 不得尝试访问、恢复、修改或永久删除回收站内容。
- 不得管理家庭成员、角色、邀请、健康档案或家庭解散。
`;
}

module.exports = {
  renderExternalAccessSkillDraft,
};
