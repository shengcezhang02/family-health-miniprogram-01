# AI-M0 验收：共享业务层和实验开关

AI-M0 只建立外部访问的安全骨架，不创建令牌，也不读取或修改任何家庭健康数据。

## 已完成

- 固定 `experimental_full_family_health_v1` 权限预设和家庭告知版本；
- 固定 17 个外部动作及其 `context`、`healthItems`、`templates` 业务服务归属；
- 动作路由只调用现有业务服务适配器，不包含成员权限、模板校验、状态机或数据库写入；
- 默认关闭 `EXTERNAL_ACCESS_ENABLED`，关闭时入口统一返回 404；
- 新建 `external-access-api` 云函数骨架，只接受 `POST /v1/action`；
- 明确拒绝已识别的明文 HTTP 请求，响应禁止缓存；
- Skill 草案强制使用 HTTPS，不允许 `--insecure`，不包含回收站和家庭管理动作；
- 共享模块从 `packages/family-health-business` 自动同步到云函数根目录，避免在适配层复制业务规则，并兼容开发者工具的云函数上传行为。

## 自动验收

```powershell
npm run build:external-business
npm test
```

预期：全部测试通过，其中 AI-M0 测试确认：

1. 未设置实验开关时任何外部 action 都不会调用业务服务；
2. `restoreItem`、`getRecycleBin` 和永久删除不在动作白名单；
3. 合法动作只被路由到一个共享业务领域；
4. 云函数部署目录不依赖父目录源码；
5. 明文 HTTP 被拒绝，Skill 只生成 `https://` 地址。

## 开发环境验收

部署 `external-access-api` 时不要配置 `EXTERNAL_ACCESS_ENABLED=true`。通过云函数本地调试或直接调用它，任意请求都应得到：

```json
{
  "ok": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "接口不存在"
  }
}
```

这证明快速版虽然已经存在外部入口骨架，但在 AI-M1 完成令牌认证前不会开放。

2026-08-19 已在开发环境 `cloud1-d0gf9cdxd89dafde0` 完成真实云调用验收：云函数成功加载并返回 `404 / NOT_FOUND`，响应同时包含 `Cache-Control: no-store` 和 HSTS。验收过程未创建令牌，也未读取或修改家庭健康数据。

## 暂不属于 AI-M0

- 创建、复制、撤销或验证永久令牌；
- 数据库集合与访问历史；
- 小程序“AI 与外部应用”管理页面；
- 真实 `getContext`、查询或写入动作；
- CloudBase HTTP 访问路由和公网 HTTPS 地址。

这些内容分别在 AI-M1 至 AI-M3 完成。
