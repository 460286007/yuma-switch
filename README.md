<div align="center">

# Yuma Switch

### AI CLI 工具的多账号供应商切换器（Claude Code / Codex / Gemini / ZCode / Git 账号 一站式管理）

[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-orange.svg)](https://tauri.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

基于开源项目 [cc-switch](https://github.com/farion1231/cc-switch) 定制的个人版本

</div>

---

## ✨ 这是什么

Yuma Switch 是一个桌面应用（Windows / macOS / Linux），用来集中管理各类 AI CLI 工具的「供应商配置」，在不同 API 供应商之间**一键切换**，不用手动改配置文件。切换只改写各工具的 live 配置文件，其余设置原样保留。

在此基础上，这个定制版新增了 **ZCode 支持** 和 **Git 账号管理**。

## 🚀 功能特性

### 供应商切换（继承自 cc-switch）

- 支持 **Claude Code、Claude Desktop、Codex、Gemini CLI、Grok Build、OpenCode、OpenClaw、Hermes、Pi**
- 供应商预设库（官方 / 聚合 / 第三方分类）、端点测速、拖拽排序
- MCP / Prompts / Skills 统一管理，多设备同步（WebDAV / S3）
- 本地代理与故障转移（failover）
- 用量统计与订阅余额查询

### 本定制版新增

| 功能 | 说明 |
|---|---|
| 🆕 **ZCode 应用支持** | 在应用列表中管理 ZCode（`~/.zcode/cli/config.json`）的供应商，预设 BigModel / Z.AI，切换即写 `provider["cc-switch"]` + `model.main` |
| 🔀 **Git 账号管理** | 顶栏 Git 入口集中管理 **Gitee / GitHub** 多套账号（用户名 / 邮箱 / 密码 / 本地项目路径），点「使用」即执行 `git config --global user.name / user.email` 切换全局身份 |
| 🎨 **Yuma 品牌与主题** | 应用更名 Yuma Switch、专属图标、紫罗兰主题（浅紫 / 深紫） |

## 🛠️ 开发与构建

环境要求：[Node.js](https://nodejs.org/) ≥ 20、[pnpm](https://pnpm.io/) ≥ 10、[Rust](https://www.rust-lang.org/) ≥ 1.95（含 clippy / rustfmt）。

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 前端类型检查 / 单元测试
pnpm typecheck
pnpm test:unit

# 打正式安装包（Windows 下生成 NSIS / MSI）
pnpm build
```

构建产物位于 `src-tauri/target/release/bundle/`，绿色版可执行文件为 `src-tauri/target/release/yuma-switch.exe`。

## 📁 目录结构

```
├── src/                  # 前端（React 18 + TypeScript + TanStack Query）
│   ├── components/       # UI 组件（providers / git / settings ...）
│   ├── config/           # 供应商预设（含 zcodeProviderPresets）
│   ├── lib/api/          # Tauri invoke 封装
│   └── i18n/locales/     # 四语言文案（zh / zh-TW / en / ja）
├── src-tauri/            # 后端（Rust + Tauri 2）
│   ├── src/commands/     # IPC 命令（含 git_account.rs）
│   ├── src/services/     # 业务逻辑（provider / mcp / skill ...）
│   └── src/zcode_config.rs  # ZCode live 配置读写
└── tests/                # 前端测试（vitest + MSW）
```

## 📄 许可证

[MIT](./LICENSE)

本项目基于 [farion1231/cc-switch](https://github.com/farion1231/cc-switch)（MIT）修改，感谢原作者的开源贡献。
