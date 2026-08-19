# AI-M3 完整写入与回收站边界验收

## 本阶段结果

AI-M3 在既有 HTTPS 单入口上接入了受控写入。外部令牌所有者只要仍是目标家庭的有效成员，就可以为同家庭成员管理日常健康事项和模板；不再要求其他成员逐人确认。

已开放动作：

- 健康事项：`createRecord`、`createReminder`、`createRecurringRule`、`updateHealthItem`；
- 状态操作：`checkInReminder`、`pauseRule`、`resumeRule`；
- 删除：`softDeleteItem`，只允许进入回收站；
- 模板：`createCustomTemplate`、`updateCustomTemplate`、`setTemplateStatus`、`copySystemTemplate`、`updateSystemTemplateSettings`。

## 安全与一致性边界

- 创建动作按令牌所有者和 `requestId` 生成稳定编号；相同请求重试不会产生重复记录。
- 修改、打卡、暂停、恢复、软删除和模板设置必须提交最新 `expectedRevision`。
- 系统模板设置使用家庭 `revision`；成功后返回新的 `familyRevision`。
- 健康事项与自定义模板保存 `createdVia`、`updatedVia` 和外部令牌审计编号。
- 外部 payload 使用逐动作字段白名单，不能伪造审计、删除状态或内部字段。
- 外部读取始终排除软删除对象；动作白名单中没有回收站读取、恢复和永久删除。
- 令牌不能管理家庭、成员、邀请、角色、健康档案或关心分享。

## 自动化验证

```bash
npm run build:external-business
npm test
```

当前结果：272 项测试通过。

覆盖重点：

- 记录、提醒、周期规则的创建、修改、打卡、暂停、恢复和软删除；
- 自定义模板创建、修改、停用和系统模板复制、设置；
- 同一请求幂等、版本冲突、家庭权限与输入白名单；
- 软删除只写删除标记，外部接口不能触达回收站；
- HTTPS 错误码、访问历史脱敏和含令牌 Skill。

## 人类 curl 验收顺序

所有请求使用用户从小程序复制的 HTTPS Base URL 与 Bearer 令牌。不要把真实令牌写入仓库或截图。

1. `getContext`：取得 `familyId`、成员 ID、模板 ID 和家庭 `revision`。
2. `createRecord`：新建一条明确标为测试的记录，保存返回的 `id` 和 `revision`。
3. `getHealthItem`：确认记录可以读取。
4. `updateHealthItem`：携带最新 `expectedRevision` 修改测试记录。
5. 使用旧版本再次修改：应返回 HTTP 409 与 `REVISION_CONFLICT`。
6. `softDeleteItem`：携带最新版本软删除测试记录。
7. 再次 `getHealthItem`：应返回 HTTP 404 与 `RESOURCE_NOT_FOUND`。
8. 尝试 `restoreItem`、永久删除或 `includeDeleted`：应在业务执行前被拒绝。
9. 在小程序回收站确认该测试记录仍可由人类查看和恢复。
10. 复制最新 Skill 给外部 AI，确认其中不再提示 `SERVICE_NOT_READY`，并能按最新版本调用写动作。

## 部署记录

- 云函数：`external-access-api`
- 环境：开发环境 `cloud1-d0gf9cdxd89dafde0`
- 部署结果：成功，云函数状态为 `Active`，部署包共 25 个文件。
- 真实 HTTPS 验收：通过。
  - 创建记录返回 200；同 `requestId` 重放返回同一记录且 `replayed = true`；
  - 读取、修改返回 200，修改后 `revision` 从 1 变为 2；
  - 使用旧版本修改返回 409 `REVISION_CONFLICT`；
  - 软删除返回 200，删除后读取返回 404 `RESOURCE_NOT_FOUND`；
  - 尝试 `restoreItem` 返回 400 `ACTION_NOT_ALLOWED`；
  - 最近 20 次访问历史包含上述成功与失败动作；
  - 云端生成 Skill 包含全部 13 个写动作和 `familyRevision`，不再包含 `SERVICE_NOT_READY`。
- 验收产生一条备注为“AI-M3 云端验收测试（已修改）”的体温记录，现位于小程序回收站，可由人类恢复或永久删除。
