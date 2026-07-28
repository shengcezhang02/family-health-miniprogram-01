# M0 开发地基验收

状态：已通过（本地云函数调试）

## 已自动验证

- [x] 根目录已初始化 Git，并保存 QuickStart 基线提交；
- [x] 根目录 `npm test` 可运行；
- [x] `family-api` 不支持的 action 返回 `UNSUPPORTED_ACTION`；
- [x] `bootstrap` 返回统一成功结构且不暴露 openid；
- [x] 内部异常不会把敏感信息返回前端；
- [x] 请求中伪造的 openid、userId 和 role 不会成为可信身份；
- [x] WXML 编译通过；
- [x] WXSS 编译通过；
- [x] 模拟器已显示“家庭健康”应用壳；
- [x] 云函数未部署时，页面显示可重试的安全错误；
- [x] 云数据库中不存在 QuickStart 的 `sales` 集合。

## 等待完成

- [x] `family-api` 本地调试已开启；
- [x] 页面显示“环境已就绪”；
- [x] 自动化断言 `status = ready`；
- [x] 检查 console：只有本地调试开启前的受控连接失败记录，没有新的未处理异常；
- [x] 页面截图检查通过；
- [x] 生成人类可用的最终 M0 提交。

## 人工验收步骤

1. 在微信开发者工具确认 `family-api` 部署；
2. 等待 Codex 查询部署任务结果并刷新模拟器；
3. 确认首页不再显示 QuickStart；
4. 确认首页标题是“家庭健康”；
5. 确认状态卡显示“环境已就绪”；
6. 临时断网后点击“重新加载”，确认出现清楚错误提示；
7. 恢复网络并再次点击“重新加载”，确认恢复就绪状态。

## 远程部署说明

```text
environment: cloud1-d0gf9cdxd89dafde0
function: family-api
resource status: Active
code status: 本地调试已验证，远程代码尚未验证
```

首次 CLI 部署在函数仍处于 `Creating` 时尝试更新代码，云端返回
`FailedOperation.UpdateFunctionCode`。随后查询到函数资源已经是 `Active`。
为避免因开发者工具界面问题反复发起写操作，M0 先使用已验证的本地云函数调试；
在真机预览前重新完成一次远程部署与调用验证。
