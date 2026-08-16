# 琅嬛本地开源版

琅嬛是一套本地优先的角色、世界观、聊天与创作工作台。这个仓库是独立的纯净开源版本：打开后直接进入工作区，没有账号、登录、注册、访客模式或管理员后台。

## 这个版本的边界

- 一个部署对应一个本地工作区，内部固定作用域为 `local`。
- 首次启动创建空数据库，不自动写入角色、世界、对话、任务或演示数据。
- 服务固定监听 `127.0.0.1`。首发不支持局域网或公网部署。
- 项目没有遥测、作者回传、远程管理入口或跨用户查看能力。
- 未配置第三方 AI、天气服务或主动使用本机 CLI 桥时，不产生对应的外部业务请求。
- `/admin`、`/api/admin/*`、`/api/auth/*` 和 `/api/guest/*` 均明确返回 404。

详细依据见 [PRIVACY.md](PRIVACY.md) 和 [网络边界](docs/network-boundaries.md)。

## 本机运行

要求：Node.js 20.19 或更高版本、npm 10 或更高版本。

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

开发界面位于 `http://127.0.0.1:5173`，本机 API 位于 `http://127.0.0.1:3000`。

构建并以单端口运行：

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

默认地址是 `http://127.0.0.1:3217`。端口可以通过根目录 `.env` 的 `PORT` 调整，监听地址不能通过配置改成公网地址。

## 数据位置

默认数据库和本机密钥位于 `server/data/`；上传内容也保存在本机项目数据目录。这个目录以及 `.env` 都被 Git 忽略。删除工作区前请先使用界面中的本地导出功能备份需要保留的内容。

## 可选外部服务

AI、天气、Codex CLI、Claude CLI、AGY CLI 和 Colab 训练均为部署者主动配置或触发的功能。启用前请阅读 [网络边界](docs/network-boundaries.md)，确认会发送的数据和服务方隐私政策。项目作者不运营默认中转服务。

## 验证

```powershell
npm run verify
```

该命令执行类型检查、服务端测试、浏览器单元测试、生产构建和开源发行扫描。发行扫描以实际 Git 候选文件为准，并检查计划目录、数据库、私钥、禁用称呼、许可证正文和构建产物。

## 许可证是什么

本项目使用 `AGPL-3.0-only`，完整正文见 [LICENSE](LICENSE)。简单说：

- 可以使用、研究、修改和再发布；
- 再发布时要保留许可证和对应源码；
- 如果修改版通过网络给其他人使用，也要让这些使用者能取得运行中的对应源码；
- `only` 表示只采用 AGPL 第 3 版，不自动接受未来版本。

这不是法律意见；正式权利与义务以 `LICENSE` 原文为准。

## 贡献与安全

- 贡献说明：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全问题：[SECURITY.md](SECURITY.md)
- 架构说明：[docs/architecture.md](docs/architecture.md)
- 素材与第三方说明：[docs/assets.md](docs/assets.md)

公开仓库不接收 `docs/plans/**`、数据库、备份、日志、密钥、真实对话或私人素材。
