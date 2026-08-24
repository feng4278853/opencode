# opencode 私有化改造设计

> 日期：2026-07-12
> 状态：已确认，待实现
 Fork 仓库：GitHub 私有仓库
> 构建产物：单一二进制 `mycode`

---

## 1. 背景与目标

公司 EDR 禁止使用 opencode，需改造代码满足私有化需求。EDR 检测维度不确定，按最严格场景处理（网络回传 + 进程名 + 二进制特征 + 文件系统痕迹）。

**核心目标**：
1. 屏蔽所有 opencode 回传地址，EDR 不能检测到启动的是 opencode
2. 保留 opencode 现有功能（除云端账号/同步外），版本更新后私有化版本可跟随升级
3. 全量去除用户可见的 "opencode" 痕迹，重命名为 `mycode`

**非目标**：
- 不改造为多用户/团队部署（仅个人使用）
- 不重定向到私有服务器（直接禁用云端功能）
- 不保留 opencode 自有账号/会话同步/设置同步体系
- 不改 `OPENCODE_*` 环境变量前缀（EDR 不检查环境变量名，改动波及 50+ 文件 + 全部文档）
- 不改内部代码标识符（Effect Context 服务键 `@opencode/*`、TypeId 等，用户不可见）

**保留**：
- AI provider 鉴权（本地 `auth.json` 存储 API Key / OAuth token）
- 所有直连 vendor 的 provider 插件（OpenAI / Anthropic / Google / GitHub Copilot 等）
- TUI 全部功能
- 桌面端 crash reporter（已 `uploadToServer: false`，纯本地）

---

## 2. 方案选择

**方案 A：用户可见层全量去品牌**（已选）

改动范围 ~30-40 个文件，每处改动 1-2 行。改所有用户可见的 "opencode" 字符串为 "mycode"，保留 `OPENCODE_*` 环境变量前缀和内部代码标识符。rebase 友好度高——改动散落但每处极小。

---

## 3. 改动清单

> **范围说明**：用户选择"编译为单一二进制"（CLI Path A），以下改动覆盖 CLI + TUI + 本地 server。`packages/desktop`（Electron 桌面端）和 `packages/app`（Web UI）的改动标记为 `[桌面/Web]`，仅在需要构建桌面端或 Web UI 时执行；CLI-only 构建可跳过，但执行后不影响 CLI 构建。

### 3.1 回传/遥测禁用

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| 1 | `packages/opencode/src/cli/upgrade.ts` | `upgrade()` 函数体改为 `return` | 禁用 CLI/TUI 自动更新检查，切断对 opencode.ai/install、brew、npm、choco、scoop、GitHub releases 的 6 个检查端点 |
| 2 | `packages/desktop/src/main/constants.ts` | `UPDATER_ENABLED = false` | `[桌面/Web]` 禁用桌面端自动更新器 |
| 3 | `packages/core/src/observability/otlp.ts` | `loggers()` 返回 `[]`，`tracingLayer()` 返回 `Layer.empty` | 彻底禁用 OpenTelemetry OTLP 导出 |
| 4 | 构建时不设置 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `VITE_SENTRY_DSN` | 无代码改动，仅构建配置 | Sentry 在无 DSN 时自动成为死代码 |
| 5 | `script/stats.ts` | 删除或忽略 | PostHog CI 脚本，不打包进运行时 |

### 3.2 云端功能禁用

| # | 文件 | 改动 | 说明 |
|---|------|------|------|
| 1 | `packages/core/src/plugin/provider.ts:58` | 删除 `OpencodePlugin,` 行 | 移除 opencode 云端 provider 插件注册，切断对 console.opencode.ai 的所有调用 |
| 2 | `packages/opencode/src/share/share-next.ts` | `disabled = true` 硬编码 | 禁用会话分享功能，切断对 opncd.ai 的上传 |
| 3 | `packages/opencode/src/effect/app-runtime.ts` | 移除 `ShareNext.node` + `SessionShare.node` 依赖 | 从运行时层移除 share 服务 |
| 4 | `packages/opencode/src/config/config.ts:478-514` | 删除 account 相关的 console config 同步块 | 禁用从 console.opencode.ai 拉取 org-scoped 配置 |
| 5 | `packages/opencode/src/account/account.ts` | `Account.Service` 各方法返回空值/Option.none() | 将 account 模块变为 no-op 层，保留接口避免破坏 Config 依赖链 |
| 6 | `packages/opencode/src/cli/cmd/account.ts` | 移除 `console` 命令注册 | 移除 `mycode console login/logout/switch/orgs/open` CLI 命令 |
| 7 | `packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts` | 移除 console 相关 handler | 移除 `/console`、`/console/orgs`、`/console/switch` HTTP 端点 |
| 8 | `packages/enterprise/` | 删除整个目录 + 从 root package.json workspace 移除 | 移除云端 share 后端 |

### 3.3 名称重命名（opencode → mycode）

#### 3.3.1 XDG 根目录名（单点改动，自动级联）

| 文件 | 行 | 改动 | 级联效果 |
|------|-----|------|---------|
| `packages/core/src/global.ts` | 10 | `const app = "opencode"` → `"mycode"` | `~/.local/share/mycode`、`~/.cache/mycode`、`~/.config/mycode`、`~/.local/state/mycode`、`/tmp/mycode` 等全部自动变更 |

#### 3.3.2 项目本地目录 `.opencode` → `.mycode`

约 10 个文件中的 `.opencode` 字面量改为 `.mycode`：

- `packages/opencode/src/config/paths.ts:29,35`
- `packages/core/src/config.ts:181,189,195`
- `packages/opencode/src/config/config.ts`（多处）
- `packages/opencode/src/config/tui.ts:203,206`
- `packages/core/src/plugin/agent.ts:146`
- `packages/opencode/src/agent/agent.ts:173`
- `packages/opencode/src/session/session.ts:333`
- `packages/opencode/src/plugin/tui/runtime.ts:256-258,817`
- `packages/opencode/src/plugin/install.ts:337`
- `packages/opencode/src/cli/cmd/mcp.ts:399`
- `packages/core/src/skill/discovery.ts:129,180`（`.opencode-version` → `.mycode-version`）
- `packages/core/src/project.ts:66,125`（`.git/opencode` → `.git/mycode`）

#### 3.3.3 配置文件名

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/core/src/config.ts` | 142 | `opencode.json` / `opencode.jsonc` → `mycode.json` / `mycode.jsonc` |
| `packages/opencode/src/config/config.ts` | 多处 | 同步更新搜索路径 |
| `packages/opencode/src/cli/cmd/mcp.ts` | 399 | MCP 配置搜索路径 |

#### 3.3.4 二进制名 / CLI 命令名

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/opencode/script/build.ts` | 183 | `outfile: 'dist/${name}/bin/opencode'` → `'dist/${name}/bin/mycode'` |
| `packages/opencode/script/build.ts` | 184 | `--user-agent=opencode/${Script.version}` → `mycode/${Script.version}` |
| `packages/opencode/script/build.ts` | define 块 | 新增 `OPENCODE_CLI_NAME: '"mycode"'` |
| `packages/opencode/script/build.ts` | 203,206 | smoke-test 路径 `bin/opencode` → `bin/mycode` |
| `packages/opencode/package.json` | 18-20 | `bin: { "opencode": ... }` → `{ "mycode": ... }`（个人使用不走 npm 分发，但保持一致性仍建议修改） |

#### 3.3.5 HTTP 认证用户名

9 个文件中 `"opencode"` 默认用户名改为 `"mycode"`（`packages/server` 下的为 CLI 构建必改；`packages/desktop` 和 `packages/app` 下的为 `[桌面/Web]` 可选）：

- `packages/server/src/auth.ts:32,56`
- `packages/server/src/routes.ts:42,48`
- `packages/desktop/src/main/sidecar.ts:62,85`
- `packages/desktop/src/main/wsl/sidecar.ts:25`
- `packages/desktop/src/main/index.ts:352`
- `packages/desktop/src/main/server.ts:194`
- `packages/app/src/utils/server.ts:6,15`
- `packages/app/src/components/terminal.tsx:183`
- `packages/app/src/components/dialog-select-server.tsx:23`

#### 3.3.6 mDNS 服务标识

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/opencode/src/server/mdns.ts` | 11-12 | `opencode.local` → `mycode.local`，`opencode-${port}` → `mycode-${port}` |
| `packages/opencode/src/cli/network.ts` | 24-25 | 默认 `--mdns-domain` → `mycode.local` |

#### 3.3.7 数据库/日志文件名

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/core/src/database/database.ts` | 53-54 | `opencode.db` / `opencode-${channel}.db` → `mycode.db` / `mycode-${channel}.db` |
| `packages/core/src/observability/logging.ts` | 49 | `opencode.log` → `mycode.log` |

#### 3.3.8 OTEL 观测标识

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/core/src/observability/otlp.ts` | 38 | `serviceName: "opencode"` → `"mycode"` |
| `packages/core/src/observability/otlp.ts` | 43-44 | `opencode.client` / `opencode.run` → `mycode.client` / `mycode.run` |

#### 3.3.9 外部 User-Agent / Referer 头

| 文件 | 改动 |
|------|------|
| `packages/core/src/models-dev.ts:18` | `opencode/${channel}/...` → `mycode/${channel}/...` |
| `packages/core/src/tool/websearch.ts:240` | 同上 |
| `packages/core/src/plugin/provider/openai.ts:192,271` | User-Agent + originator |
| `packages/core/src/plugin/provider/gitlab.ts:22` | User-Agent |
| `packages/core/src/plugin/provider/cloudflare-workers-ai.ts:67` | User-Agent |
| `packages/core/src/plugin/provider/cloudflare-ai-gateway.ts:74` | User-Agent |
| `packages/core/src/plugin/provider/openrouter.ts` | `HTTP-Referer` / `X-Title` |
| `packages/core/src/plugin/provider/zenmux.ts` | 同上 |
| `packages/core/src/plugin/provider/vercel.ts` | 同上 |
| `packages/core/src/plugin/provider/nvidia.ts` | 同上 |
| `packages/core/src/plugin/provider/kilo.ts` | 同上 |
| `packages/core/src/plugin/provider/llmgateway.ts` | `HTTP-Referer` / `X-Title` / `X-Source` |
| `packages/core/src/plugin/provider/cerebras.ts:13` | `X-Cerebras-3rd-Party-Integration` |
| `packages/opencode/src/installation/index.ts:42` | User-Agent |

#### 3.3.10 桌面 App 标识 `[桌面/Web]`（仅构建桌面端时需要）

| 文件 | 改动 |
|------|------|
| `packages/desktop/electron-builder.config.ts` | App ID `ai.opencode.desktop*` → `ai.mycode.desktop*`，产物名 `opencode-desktop-*` → `mycode-desktop-*`，URL scheme `opencode://` → `mycode://` |
| `packages/desktop/src/main/index.ts:46-55` | APP_NAMES / APP_IDS |
| `packages/desktop/src/main/migrate.ts:25-29,48-51` | 迁移 ID + store 名 |

#### 3.3.11 系统级配置路径

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/opencode/src/config/managed.ts` | 8 | plist domain `ai.opencode.managed` → `ai.mycode.managed` |
| `packages/opencode/src/config/managed.ts` | 22-27 | `/Library/Application Support/opencode` → `mycode`，`/etc/opencode` → `/etc/mycode`，`C:\ProgramData\opencode` → `C:\ProgramData\mycode` |

#### 3.3.12 Shell argv0

| 文件 | 行 | 改动 |
|------|-----|------|
| `packages/core/src/shell.ts` | 179,193 | `"opencode"` → `"mycode"` |

### 3.4 不改的内容（方案 A 边界）

- `OPENCODE_*` 环境变量前缀（EDR 不检查环境变量名，改动波及 50+ 文件 + 全部文档）
- Effect Context 服务键 `@opencode/*`、TypeId 等内部代码标识符（用户不可见）
- npm 包名 `opencode-ai`（个人使用不走 npm 分发）
- VSCode 扩展 ID `sst-dev.opencode`（个人使用不一定需要扩展）

---

## 4. 构建与分发

**构建路径**：Path A（`packages/opencode`）—— 完整 TUI 二进制。

**构建命令**（个人使用）：
```bash
cd packages/opencode
OPENCODE_VERSION=1.0.0 bun run script/build.ts --single --skip-install
# 产物：dist/opencode-<os>-<arch>/bin/mycode
```

**版本号策略**：
- 不走 CI 自动版本计算
- 手动设置 `OPENCODE_VERSION` 环境变量
- 或接受默认 `0.0.0-<branch>-<timestamp>` 预览版本

**Sentry 禁用**：构建时不设置 `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` / `VITE_SENTRY_DSN` 环境变量。

---

## 5. Fork 仓库管理与 rebase 策略

### 5.1 仓库设置

```
upstream → anomalyco/opencode (dev 分支)
origin   → GitHub 私有仓库 (dev 分支，含私有化改动)
```

### 5.2 改动隔离原则

所有改动分为三类：

**A. 功能禁用类（gut / no-op）**——改函数体，不改函数签名：
- `upgrade.ts`、`otlp.ts`、`share-next.ts`、`account.ts`、`constants.ts`
- rebase 安全：上游改函数内部逻辑时，冲突仅在函数体层面，且我们本就不需要上游的新逻辑。

**B. 字符串替换类（rename）**——改字面量值：
- `global.ts`、各文件 `"opencode"` → `"mycode"`
- rebase 风险低：上游极少改这些字面量。

**C. 删除类（remove）**——删除行/块：
- `provider.ts:58` 删除 `OpencodePlugin,`
- `config.ts:478-514` 删除 account 同步块
- `packages/enterprise/` 删除整个目录
- rebase 风险中：上游可能在删除区域附近新增代码。解决方式：rebase 时检查该区域是否仍存在，存在则重新删除。

### 5.3 升级流程

```bash
# 1. 拉取上游
git fetch upstream

# 2. 创建升级分支
git checkout -b upgrade-<date>

# 3. rebase
git rebase upstream/dev

# 4. 解决冲突（预期主要在 config.ts、provider.ts）
#    原则：保留我们的改动，合入上游的新功能

# 5. 验证
cd packages/opencode
bun typecheck
OPENCODE_VERSION=1.0.0 bun run script/build.ts --single --skip-install

# 6. 测试运行
./dist/opencode-<os>-<arch>/bin/mycode --version
./dist/opencode-<os>-<arch>/bin/mycode  # 启动 TUI 测试

# 7. 合并回主分支
git checkout dev
git merge upgrade-<date>
```

### 5.4 冲突处理优先级

| 冲突位置 | 处理原则 |
|---------|---------|
| `global.ts` | 保留 `"mycode"` |
| `upgrade.ts` / `otlp.ts` / `share-next.ts` / `account.ts` | 保留 no-op 实现（不接受上游的新功能逻辑） |
| `provider.ts` | 保留删除 `OpencodePlugin` |
| `config.ts` | 保留删除 account 同步块，但合入上游其他 config 改动 |
| 字符串替换处 | 保留 `"mycode"` |
| 新增文件 | 直接接受上游新增 |

### 5.5 分支策略

- 所有改动直接在 `dev` 分支上
- 每次 rebase 后 `dev` 分支 = `upstream/dev` + 私有化改动
- 使用 `git rebase` 而非 `git merge`，保持线性历史

---

## 6. 验收标准

### 6.1 回传/遥测

- 运行 `mycode` 并用网络监控确认除用户配置的 LLM provider 外无任何对外请求
- 无对 `*.opencode.ai`、`*.opncd.ai`、`formulae.brew.sh`、`community.chocolatey.org`、`raw.githubusercontent.com/ScoopInstaller`、`api.github.com/repos/anomalyco/opencode` 的请求

### 6.2 云端功能

- `mycode` 启动后无任何对 `*.opencode.ai` / `*.opncd.ai` 的请求
- 使用 `OPENAI_API_KEY` 能正常发起会话
- `mycode console login` 命令不存在
- `mycode share` 功能不存在

### 6.3 名称重命名

- 进程名为 `mycode`（通过任务管理器确认）
- 配置目录为 `~/.config/mycode`
- 数据目录为 `~/.local/share/mycode`
- 项目目录为 `.mycode`
- 配置文件为 `mycode.json` / `mycode.jsonc`
- 数据库文件为 `mycode.db`
- 日志文件为 `mycode.log`
- mDNS 域名为 `mycode.local`

### 6.4 构建

- `./mycode --version` 输出 `mycode/1.0.0`
- `./mycode --help` 命令名显示为 `mycode`
- `file mycode` 确认是单个可执行二进制
- Windows 上 `mycode.exe` 可直接运行

### 6.5 rebase

- 能成功 `git fetch upstream && git rebase upstream/dev`
- rebase 后 `bun typecheck` 通过
- rebase 后构建产物正常工作

---

## 7. 异常场景与边界处理

1. **上游删除了我们依赖的文件**：rebase 时 Git 会标记为冲突，手动检查该文件是否仍被引用，如不再引用则跳过。
2. **上游重命名了 `opencode` 字符串**：极低概率事件。如发生，rebase 时会冲突，手动保留 `"mycode"`。
3. **上游新增了新的回传地址**：rebase 后需重新审计新增代码，确认无新的对外请求。可通过网络监控在 rebase 后的验证步骤中发现。
4. **上游新增了新的云端功能**：rebase 后需检查新增功能是否依赖 opencode 云端基础设施，如依赖则禁用。

---

## 8. 技术规范

- 参考工程已有代码规范，保持风格一致
- 使用 codealtas 提供的 MCP 接口辅助开发，并记录使用 MCP 过程中发现的问题
- TypeScript 严格类型，不使用 `as any` / `@ts-ignore`
- 构建：`bun build --compile`
- 类型检查：`bun typecheck`（从 package 目录运行）
