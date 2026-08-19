# 家庭健康小程序

一个使用微信原生小程序和 CloudBase 构建的家庭健康信息管理工具。

## 当前阶段

M1 至 M11 已完成，当前进入 AI 外部访问实验功能。

[AI-M0 共享业务层和实验开关](docs/AI-M0-ACCEPTANCE.md)建立了外部入口的安全骨架；[AI-M1 永久令牌、复制和访问历史](docs/AI-M1-ACCEPTANCE.md)完成了凭证管理；[AI-M2 真实数据只读访问](docs/AI-M2-ACCEPTANCE.md)已经完成并部署到开发环境。下一阶段 AI-M3 将接入受控写入和回收站。

## 本地验证

```bash
npm run build:cloudfunctions
npm test
```

小程序源代码位于 `miniprogram/`，云函数位于 `cloudfunctions/`。
