# opencode 私有化改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 opencode fork 改造为私有化版本 `mycode`，禁用所有回传/遥测/云端功能，保留 AI provider 鉴权，编译为单一二进制。

**Architecture:** 在 opencode monorepo 的 dev 分支上直接修改，改动分三类：(A) 功能禁用（gut/no-op），(B) 字符串替换（rename），(C) 删除（remove）。通过 `bun build --compile --single` 编译为单一二进制。

**Tech Stack:** TypeScript, Bun, Effect v4, Drizzle (SQLite)

## Global Constraints

- 不使用 `as any` / `@ts-ignore`
- 类型检查：`bun typecheck`（从 package 目录运行，如 `packages/opencode`）
- 构建：`bun run script/build.ts --single --skip-install`（从 `packages/opencode` 运行）
- 保持 `OPENCODE_*` 环境变量前缀不变（方案 A 边界）
- 保持内部代码标识符不变（Effect Context 服务键 `@opencode/*`、TypeId 等）
- 每个任务结束后运行 `bun typecheck` 验证
- 参考设计文档：`docs/superpowers/specs/2026-07-12-opencode-privatization-design.md`

---

## File Structure

改动按 package 分组：

- `packages/core/src/` — 全局路径、观测性、数据库、配置、provider 注册
- `packages/opencode/src/` — CLI、TUI、share、account、config、server、构建脚本
- `packages/server/src/` — HTTP 认证
- `packages/enterprise/` — 删除
- Root `package.json` — 移除 enterprise workspace

---

### Task 1: Fork 仓库设置

**Files:**
- 无文件改动，仅 git 操作

**Interfaces:**
- Consumes: 无
- Produces: GitHub 私有仓库 + upstream remote 配置

- [ ] **Step 1: 在 GitHub 创建私有仓库**

在 GitHub 上创建一个私有仓库（如 `mycode`），不初始化 README。

- [ ] **Step 2: 添加 origin remote 并推送**

```bash
cd F:\Git\my-open-code\opencode
git remote add origin git@github.com:<your-username>/mycode.git
git push -u origin dev
```

- [ ] **Step 3: 添加 upstream remote**

```bash
git remote add upstream https://github.com/anomalyco/opencode.git
git fetch upstream
```

- [ ] **Step 4: 验证 remote 配置**

Run: `git remote -v`
Expected: 显示 origin（私有仓库）和 upstream（anomalyco/opencode）

---

### Task 2: 禁用自动更新检查

**Files:**
- Modify: `packages/opencode/src/cli/upgrade.ts` (整个 `upgrade()` 函数体)

**Interfaces:**
- Consumes: 无
- Produces: `upgrade()` 成为 no-op，不再发起任何网络请求

- [ ] **Step 1: 将 upgrade() 函数体改为直接 return**

将 `packages/opencode/src/cli/upgrade.ts` 的 `upgrade` 函数改为：

```ts
export async function upgrade() {
  return
}
```

保留文件顶部的 import 语句不变（避免触发 unused import 警告时再清理，但 Effect 构建通常不报 unused）。

实际上，由于函数体不再使用任何 import，应删除全部 import 并只保留空函数：

```ts
export async function upgrade() {
  return
}
```

删除文件中所有 import 语句（第 1-6 行）和函数体（第 8-53 行），替换为上述 3 行。

- [ ] **Step 2: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过（无类型错误）

- [ ] **Step 3: Commit**

```bash
git add packages/opencode/src/cli/upgrade.ts
git commit -m "fix: disable auto-update check to prevent phone-home"
```

---

### Task 3: 禁用 OpenTelemetry OTLP 导出

**Files:**
- Modify: `packages/core/src/observability/otlp.ts` (第 50-77 行)

**Interfaces:**
- Consumes: 无
- Produces: `loggers()` 返回 `[]`，`tracingLayer()` 返回 `Layer.empty`

- [ ] **Step 1: 将 loggers() 和 tracingLayer() 改为 no-op**

将 `packages/core/src/observability/otlp.ts` 第 50-77 行替换为：

```ts
export function loggers() {
  return []
}

export async function tracingLayer() {
  return Layer.empty
}
```

同时将 `resource()` 函数中的 `serviceName` 和属性键改名（第 36-48 行）：

```ts
export function resource(): { serviceName: string; serviceVersion: string; attributes: Record<string, string> } {
  return {
    serviceName: "mycode",
    serviceVersion: InstallationVersion,
    attributes: {
      ...resourceAttributes(),
      "deployment.environment.name": InstallationChannel,
      "mycode.client": Flag.OPENCODE_CLIENT,
      "mycode.run": runID,
      "service.instance.id": runID,
    },
  }
}
```

注意：虽然 `loggers()` 和 `tracingLayer()` 已是 no-op，`resource()` 仍被其他地方引用，所以也要改名。

- [ ] **Step 2: 运行 typecheck**

Run: `cd packages/core && bun typecheck`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/observability/otlp.ts
git commit -m "fix: disable OTLP export and rename observability identity"
```

---

### Task 4: 移除 opencode 云端 provider 插件

**Files:**
- Modify: `packages/core/src/plugin/provider.ts:24,58` (删除 import 和注册)

**Interfaces:**
- Consumes: 无
- Produces: `ProviderPlugins` 数组不再包含 `OpencodePlugin`

- [ ] **Step 1: 删除 OpencodePlugin 的 import**

删除 `packages/core/src/plugin/provider.ts` 第 24 行：

```ts
import { OpencodePlugin } from "./provider/opencode"
```

- [ ] **Step 2: 删除 OpencodePlugin 的注册**

删除 `packages/core/src/plugin/provider.ts` 第 58 行：

```ts
  OpencodePlugin,
```

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/plugin/provider.ts
git commit -m "fix: remove opencode cloud provider plugin"
```

---

### Task 5: 禁用会话分享功能

**Files:**
- Modify: `packages/opencode/src/share/share-next.ts:23`
- Modify: `packages/opencode/src/effect/app-runtime.ts:47-48,106-107`

**Interfaces:**
- Consumes: 无
- Produces: share 功能完全禁用，不发起任何网络请求

- [ ] **Step 1: 硬编码 disabled = true**

将 `packages/opencode/src/share/share-next.ts` 第 23 行：

```ts
const disabled = process.env["OPENCODE_DISABLE_SHARE"] === "true" || process.env["OPENCODE_DISABLE_SHARE"] === "1"
```

改为：

```ts
const disabled = true
```

- [ ] **Step 2: 从 app-runtime.ts 移除 ShareNext 和 SessionShare 依赖**

将 `packages/opencode/src/effect/app-runtime.ts` 第 47-48 行删除：

```ts
import { ShareNext } from "@/share/share-next"
import { SessionShare } from "@/share/session"
```

将第 106-107 行删除：

```ts
    ShareNext.node,
    SessionShare.node,
```

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过（如有 unused import 警告，检查是否有其他文件引用 ShareNext/SessionShare）

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/share/share-next.ts packages/opencode/src/effect/app-runtime.ts
git commit -m "fix: disable session share functionality"
```

---

### Task 6: 将 Account 模块变为 no-op

**Files:**
- Modify: `packages/opencode/src/account/account.ts` (整个 layer 实现)
- Modify: `packages/opencode/src/config/config.ts:478-514` (删除 account config 同步块)

**Interfaces:**
- Consumes: `AccountRepo.Service`（仍保留但不使用）
- Produces: `Account.Service` 所有方法返回空值

- [ ] **Step 1: 将 Account layer 替换为 no-op 实现**

将 `packages/opencode/src/account/account.ts` 第 189-457 行（从 `const layer: Layer.Layer...` 到 `)` 结束）替换为：

```ts
const noopLayer: Layer.Layer<Service, never, never> = Layer.succeed(
  Service,
  Service.of({
    active: () => Effect.succeed(Option.none()),
    activeOrg: () => Effect.succeed(Option.none()),
    list: () => Effect.succeed([]),
    orgsByAccount: () => Effect.succeed([]),
    remove: () => Effect.void,
    use: () => Effect.void,
    orgs: () => Effect.succeed([]),
    config: () => Effect.succeed(Option.none()),
    token: () => Effect.succeed(Option.none()),
    login: () => Effect.die(new AccountServiceError({ message: "Account login disabled in privatized build" })),
    poll: () => Effect.die(new AccountServiceError({ message: "Account polling disabled in privatized build" })),
  }),
)
```

然后将第 459 行的 `node` 定义中的 `layer` 改为 `noopLayer`，并移除 deps：

```ts
export const node = LayerNode.make({ service: Service, layer: noopLayer, deps: [] })
```

注意：保留文件中的所有 import、schema 定义、类型导出不变，只替换 layer 实现和 node 导出。

- [ ] **Step 2: 删除 config.ts 中的 account config 同步块**

将 `packages/opencode/src/config/config.ts` 第 478-514 行（从 `const activeAccount = ...` 到 `}` 结束的整个 `if (activeAccount?.active_org_id) { ... }` 块）删除。

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/account/account.ts packages/opencode/src/config/config.ts
git commit -m "fix: make Account module no-op and remove console config sync"
```

---

### Task 7: 移除 console CLI 命令和 HTTP 端点

**Files:**
- Modify: `packages/opencode/src/cli/cmd/account.ts` (移除 console 命令注册)
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts` (移除 console handler)
- Modify: `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts` (移除 console schema)

**Interfaces:**
- Consumes: Task 6 的 no-op Account
- Produces: `mycode console *` 命令不存在，`/console` HTTP 端点不存在

- [ ] **Step 1: 查看 account.ts CLI 命令注册位置**

Run: `grep -n "console" packages/opencode/src/cli/cmd/account.ts`
找出 `console` 命令的注册位置。

- [ ] **Step 2: 移除 console 命令注册**

根据 Step 1 的结果，删除 `console` 命令的注册代码。如果整个文件都是 console 命令，则清空文件内容（保留必要的 export 以避免 import 断裂）。

- [ ] **Step 3: 查看并移除 experimental.ts 中的 console handler**

Run: `grep -n "console" packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts`
删除所有 console 相关的 handler 函数和导出。

- [ ] **Step 4: 查看并移除 experimental groups 中的 console schema**

Run: `grep -n "console" packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts`
删除所有 console 相关的 schema 定义。

- [ ] **Step 5: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过（如有 import 断裂，修复引用处）

- [ ] **Step 6: Commit**

```bash
git add packages/opencode/src/cli/cmd/account.ts packages/opencode/src/server/routes/instance/httpapi/handlers/experimental.ts packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts
git commit -m "fix: remove console CLI commands and HTTP endpoints"
```

---

### Task 8: 删除 enterprise 包

**Files:**
- Delete: `packages/enterprise/` (整个目录)
- Modify: root `package.json` (移除 workspace 条目)

**Interfaces:**
- Consumes: 无
- Produces: enterprise 包不存在

- [ ] **Step 1: 删除 enterprise 目录**

```bash
rm -rf packages/enterprise
```

- [ ] **Step 2: 从 root package.json 移除 enterprise workspace 条目**

打开 root `package.json`，在 `workspaces` 数组中删除 `"packages/enterprise"` 条目。

- [ ] **Step 3: 运行 install 验证**

Run: `bun install`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove enterprise package"
```

---

### Task 9: 重命名 XDG 根目录名

**Files:**
- Modify: `packages/core/src/global.ts:10`

**Interfaces:**
- Consumes: 无
- Produces: 所有 XDG 路径自动从 `~/.local/share/opencode` 变为 `~/.local/share/mycode` 等

- [ ] **Step 1: 修改 app 常量**

将 `packages/core/src/global.ts` 第 10 行：

```ts
const app = "opencode"
```

改为：

```ts
const app = "mycode"
```

- [ ] **Step 2: 运行 typecheck**

Run: `cd packages/core && bun typecheck`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/global.ts
git commit -m "refactor: rename XDG root directory from opencode to mycode"
```

---

### Task 10: 重命名项目本地目录 `.opencode` → `.mycode`

**Files:**
- Modify: `packages/opencode/src/config/paths.ts:29,35`
- Modify: `packages/core/src/config.ts:181,189,195`
- Modify: `packages/opencode/src/config/config.ts` (多处)
- Modify: `packages/opencode/src/config/tui.ts:203,206`
- Modify: `packages/core/src/plugin/agent.ts:146`
- Modify: `packages/opencode/src/agent/agent.ts:173`
- Modify: `packages/opencode/src/session/session.ts:333`
- Modify: `packages/opencode/src/plugin/tui/runtime.ts:256-258,817`
- Modify: `packages/opencode/src/plugin/install.ts:337`
- Modify: `packages/opencode/src/cli/cmd/mcp.ts:399`
- Modify: `packages/core/src/skill/discovery.ts:129,180` (`.opencode-version` → `.mycode-version`)
- Modify: `packages/core/src/project.ts:66,125` (`.git/opencode` → `.git/mycode`)

**Interfaces:**
- Consumes: Task 9
- Produces: 项目目录从 `.opencode` 变为 `.mycode`

- [ ] **Step 1: 全局搜索 `.opencode` 字面量**

Run: `grep -rn '"\.opencode"' packages/ --include="*.ts" | grep -v node_modules | grep -v '.opencode/'`
确认所有需要修改的位置。

- [ ] **Step 2: 批量替换 `.opencode` → `.mycode`**

对上述所有文件，将字符串 `".opencode"` 替换为 `".mycode"`。

注意：
- 只替换字符串字面量 `".opencode"`，不替换路径中作为目录名的 `.opencode/`（如 `__dirname/.opencode/`），这些会被上一级的目录名改动覆盖
- `.opencode-version` → `.mycode-version`
- `.git/opencode` → `.git/mycode`

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck && cd ../opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename project directory from .opencode to .mycode"
```

---

### Task 11: 重命名配置文件名

**Files:**
- Modify: `packages/core/src/config.ts:142`
- Modify: `packages/opencode/src/config/config.ts` (多处搜索路径)
- Modify: `packages/opencode/src/cli/cmd/mcp.ts:399`
- Modify: `packages/opencode/src/config/managed.ts:518` (`opencode.json` → `mycode.json`)

**Interfaces:**
- Consumes: Task 10
- Produces: 配置文件从 `opencode.json` 变为 `mycode.json`

- [ ] **Step 1: 搜索所有 `opencode.json` 和 `opencode.jsonc` 引用**

Run: `grep -rn 'opencode\.json' packages/ --include="*.ts" | grep -v node_modules`
确认所有位置。

- [ ] **Step 2: 批量替换**

将 `opencode.json` → `mycode.json`，`opencode.jsonc` → `mycode.jsonc`。

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck && cd ../opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename config files from opencode.json to mycode.json"
```

---

### Task 12: 重命名二进制名和 CLI 命令名

**Files:**
- Modify: `packages/opencode/script/build.ts:183,184,203,206` + define 块
- Modify: `packages/opencode/package.json:18-20`

**Interfaces:**
- Consumes: 无
- Produces: 二进制名为 `mycode`，`--help` 显示命令名为 `mycode`

- [ ] **Step 1: 修改 build.ts 的 outfile 和 user-agent**

将 `packages/opencode/script/build.ts` 第 183 行：

```ts
      outfile: `dist/${name}/bin/opencode`,
```

改为：

```ts
      outfile: `dist/${name}/bin/mycode`,
```

将第 184 行：

```ts
      execArgv: [`--user-agent=opencode/${Script.version}`, "--use-system-ca", "--"],
```

改为：

```ts
      execArgv: [`--user-agent=mycode/${Script.version}`, "--use-system-ca", "--"],
```

- [ ] **Step 2: 在 define 块中添加 OPENCODE_CLI_NAME**

在第 189-198 行的 `define` 对象中添加一行：

```ts
      OPENCODE_CLI_NAME: '"mycode"',
```

添加在 `OPENCODE_CHANNEL` 之后（第 195 行后）。

- [ ] **Step 3: 修改 smoke-test 路径**

将第 203 行：

```ts
    const binaryPath = `dist/${name}/bin/opencode`
```

改为：

```ts
    const binaryPath = `dist/${name}/bin/mycode`
```

- [ ] **Step 4: 修改 package.json bin 字段**

将 `packages/opencode/package.json` 中的 `bin` 字段：

```json
  "bin": {
    "opencode": "./bin/opencode"
  },
```

改为：

```json
  "bin": {
    "mycode": "./bin/opencode"
  },
```

注意：`./bin/opencode` 是 Node launcher shim 的路径，不改（个人使用不走 npm 分发，shim 不会被调用）。

- [ ] **Step 5: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add packages/opencode/script/build.ts packages/opencode/package.json
git commit -m "refactor: rename binary to mycode and set CLI command name"
```

---

### Task 13: 重命名 HTTP 认证用户名

**Files:**
- Modify: `packages/server/src/auth.ts:32,56`
- Modify: `packages/server/src/routes.ts:42,48`

**Interfaces:**
- Consumes: 无
- Produces: 默认 HTTP 认证用户名从 `"opencode"` 变为 `"mycode"`

- [ ] **Step 1: 搜索所有认证用户名 `"opencode"`**

Run: `grep -rn '"opencode"' packages/server/src/ packages/app/src/ packages/desktop/src/main/ --include="*.ts" --include="*.tsx" | grep -v node_modules`

- [ ] **Step 2: 批量替换**

在 `packages/server/src/auth.ts`、`packages/server/src/routes.ts` 中，将默认用户名 `"opencode"` 改为 `"mycode"`。

[桌面/Web] 同时替换 `packages/desktop/src/main/sidecar.ts`、`packages/desktop/src/main/wsl/sidecar.ts`、`packages/desktop/src/main/index.ts`、`packages/desktop/src/main/server.ts`、`packages/app/src/utils/server.ts`、`packages/app/src/components/terminal.tsx`、`packages/app/src/components/dialog-select-server.tsx` 中的 `"opencode"` → `"mycode"`。

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/server && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename HTTP auth username from opencode to mycode"
```

---

### Task 14: 重命名 mDNS 服务标识

**Files:**
- Modify: `packages/opencode/src/server/mdns.ts:11-12`
- Modify: `packages/opencode/src/cli/network.ts:24-25`

**Interfaces:**
- Consumes: 无
- Produces: mDNS 域名从 `opencode.local` 变为 `mycode.local`

- [ ] **Step 1: 修改 mdns.ts**

将 `packages/opencode/src/server/mdns.ts` 第 11 行 `opencode.local` 改为 `mycode.local`，第 12 行 `opencode-${port}` 改为 `mycode-${port}`。

- [ ] **Step 2: 修改 network.ts**

将 `packages/opencode/src/cli/network.ts` 第 24-25 行中默认 `--mdns-domain` 值从 `opencode.local` 改为 `mycode.local`。

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add packages/opencode/src/server/mdns.ts packages/opencode/src/cli/network.ts
git commit -m "refactor: rename mDNS service identity from opencode to mycode"
```

---

### Task 15: 重命名数据库和日志文件名

**Files:**
- Modify: `packages/core/src/database/database.ts:53-54`
- Modify: `packages/core/src/observability/logging.ts:49`

**Interfaces:**
- Consumes: Task 9
- Produces: 数据库文件从 `opencode.db` 变为 `mycode.db`，日志从 `opencode.log` 变为 `mycode.log`

- [ ] **Step 1: 修改 database.ts**

将 `packages/core/src/database/database.ts` 第 53-54 行中 `opencode.db` 改为 `mycode.db`，`opencode-${channel}.db` 改为 `mycode-${channel}.db`。

- [ ] **Step 2: 修改 logging.ts**

将 `packages/core/src/observability/logging.ts` 第 49 行 `opencode.log` 改为 `mycode.log`。

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/database/database.ts packages/core/src/observability/logging.ts
git commit -m "refactor: rename database and log filenames from opencode to mycode"
```

---

### Task 16: 重命名外部 User-Agent 和 Referer 头

**Files:**
- Modify: `packages/core/src/models-dev.ts:18`
- Modify: `packages/core/src/tool/websearch.ts:240`
- Modify: `packages/core/src/plugin/provider/openai.ts:192,271`
- Modify: `packages/core/src/plugin/provider/gitlab.ts:22`
- Modify: `packages/core/src/plugin/provider/cloudflare-workers-ai.ts:67`
- Modify: `packages/core/src/plugin/provider/cloudflare-ai-gateway.ts:74`
- Modify: `packages/core/src/plugin/provider/openrouter.ts`
- Modify: `packages/core/src/plugin/provider/zenmux.ts`
- Modify: `packages/core/src/plugin/provider/vercel.ts`
- Modify: `packages/core/src/plugin/provider/nvidia.ts`
- Modify: `packages/core/src/plugin/provider/kilo.ts`
- Modify: `packages/core/src/plugin/provider/llmgateway.ts`
- Modify: `packages/core/src/plugin/provider/cerebras.ts:13`
- Modify: `packages/opencode/src/installation/index.ts:42`

**Interfaces:**
- Consumes: 无
- Produces: 所有出站 HTTP 请求的 User-Agent / Referer 不再包含 "opencode"

- [ ] **Step 1: 搜索所有 User-Agent 和 Referer 中的 opencode**

Run: `grep -rn 'opencode' packages/core/src/plugin/provider/ packages/core/src/models-dev.ts packages/core/src/tool/websearch.ts packages/opencode/src/installation/index.ts --include="*.ts" | grep -iE 'user-agent|referer|x-title|x-source|originator|cerebras'`

- [ ] **Step 2: 批量替换**

对每个文件：
- `User-Agent: opencode/...` → `User-Agent: mycode/...`（或 `userAgent` 变量值中的 `opencode` → `mycode`）
- `HTTP-Referer: https://opencode.ai/` → `HTTP-Referer: https://mycode.local/`（或移除 Referer）
- `X-Title: opencode` → `X-Title: mycode`
- `X-Source: opencode` → `X-Source: mycode`
- `X-Cerebras-3rd-Party-Integration: opencode` → `X-Cerebras-3rd-Party-Integration: mycode`
- `originator: "opencode"` → `originator: "mycode"`

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck && cd ../opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: rename User-Agent and Referer headers from opencode to mycode"
```

---

### Task 17: 重命名 Shell argv0 和系统级配置路径

**Files:**
- Modify: `packages/core/src/shell.ts:179,193`
- Modify: `packages/opencode/src/config/managed.ts:8,22-27`

**Interfaces:**
- Consumes: 无
- Produces: shell argv0 从 `"opencode"` 变为 `"mycode"`，系统配置路径不再包含 "opencode"

- [ ] **Step 1: 修改 shell.ts**

将 `packages/core/src/shell.ts` 第 179、193 行中 `"opencode"` 改为 `"mycode"`。

- [ ] **Step 2: 修改 managed.ts**

将 `packages/opencode/src/config/managed.ts`：
- 第 8 行：`ai.opencode.managed` → `ai.mycode.managed`
- 第 22-27 行：系统目录中 `opencode` → `mycode`（`/Library/Application Support/opencode` → `/Library/Application Support/mycode`，`/etc/opencode` → `/etc/mycode`，`C:\ProgramData\opencode` → `C:\ProgramData\mycode`）

- [ ] **Step 3: 运行 typecheck**

Run: `cd packages/core && bun typecheck && cd ../opencode && bun typecheck`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/shell.ts packages/opencode/src/config/managed.ts
git commit -m "refactor: rename shell argv0 and system config paths"
```

---

### Task 18: [桌面/Web] 重命名桌面 App 标识（可选）

> **跳过条件**：如果仅构建 CLI 二进制，跳过此任务。

**Files:**
- Modify: `packages/desktop/electron-builder.config.ts`
- Modify: `packages/desktop/src/main/index.ts:46-55`
- Modify: `packages/desktop/src/main/migrate.ts:25-29,48-51`
- Modify: `packages/desktop/src/main/constants.ts` (`UPDATER_ENABLED = false`)

**Interfaces:**
- Consumes: 无
- Produces: 桌面 App ID、产物名、URL scheme 不再包含 "opencode"

- [ ] **Step 1: 修改 electron-builder.config.ts**

将所有 `ai.opencode.desktop` → `ai.mycode.desktop`，`opencode-desktop` → `mycode-desktop`，`opencode://` → `mycode://`。

- [ ] **Step 2: 修改 desktop main/index.ts**

将 APP_NAMES 中 `"OpenCode"` → `"MyCode"`，APP_IDS 同步修改，`app.setAsDefaultProtocolClient("opencode")` → `app.setAsDefaultProtocolClient("mycode")`。

- [ ] **Step 3: 修改 migrate.ts**

将迁移 ID 和 store 名中 `opencode` → `mycode`。

- [ ] **Step 4: 设置 UPDATER_ENABLED = false**

将 `packages/desktop/src/main/constants.ts` 中 `UPDATER_ENABLED` 改为 `false`。

- [ ] **Step 5: 运行 typecheck**

Run: `cd packages/desktop && bun typecheck`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/
git commit -m "refactor: rename desktop app identifiers and disable auto-updater"
```

---

### Task 19: 构建验证

**Files:**
- 无文件改动，仅构建和测试

**Interfaces:**
- Consumes: Task 1-17（或 1-18 含桌面）
- Produces: 可运行的 `mycode` 二进制文件

- [ ] **Step 1: 运行完整 typecheck**

Run:
```bash
cd packages/core && bun typecheck
cd ../opencode && bun typecheck
cd ../server && bun typecheck
```
Expected: 全部通过

- [ ] **Step 2: 构建二进制**

Run:
```bash
cd packages/opencode
OPENCODE_VERSION=1.0.0 bun run script/build.ts --single --skip-install
```
Expected: 生成 `dist/opencode-<os>-<arch>/bin/mycode`

- [ ] **Step 3: 验证版本输出**

Run: `./dist/opencode-<os>-<arch>/bin/mycode --version`
Expected: 输出 `mycode/1.0.0` 或类似

- [ ] **Step 4: 验证 --help 命令名**

Run: `./dist/opencode-<os>-<arch>/bin/mycode --help`
Expected: 帮助文本中命令名显示为 `mycode`

- [ ] **Step 5: 验证文件类型**

Run: `file ./dist/opencode-<os>-<arch>/bin/mycode`
Expected: 单个可执行二进制文件

- [ ] **Step 6: 启动 TUI 测试**

Run: `./dist/opencode-<os>-<arch>/bin/mycode`
Expected: TUI 正常启动

- [ ] **Step 7: 验证路径重命名**

在 TUI 中执行一个操作，然后检查：
- `~/.config/mycode/` 目录存在
- `~/.local/share/mycode/` 目录存在
- `~/.local/state/mycode/` 目录存在
- 数据库文件名为 `mycode.db`

- [ ] **Step 8: 网络验证**

启动 `mycode` 后，用网络监控工具（如 `netstat -an` 或 Wireshark）确认：
- 无对 `*.opencode.ai` 的请求
- 无对 `*.opncd.ai` 的请求
- 无对 `formulae.brew.sh`、`community.chocolatey.org`、`raw.githubusercontent.com/ScoopInstaller`、`api.github.com/repos/anomalyco/opencode` 的请求
- 只有用户配置的 LLM provider 请求

- [ ] **Step 9: Commit 最终状态**

```bash
git add -A
git commit -m "chore: privatization build verification"
```

---

## Self-Review

### Spec Coverage

- [x] 3.1 回传/遥测禁用 → Task 2 (upgrade.ts), Task 3 (otlp.ts), Task 18 (desktop constants)
- [x] 3.2 云端功能禁用 → Task 4 (OpencodePlugin), Task 5 (share), Task 6 (account no-op + config sync), Task 7 (console CLI/HTTP), Task 8 (enterprise)
- [x] 3.3.1 XDG 根目录 → Task 9
- [x] 3.3.2 项目目录 .opencode → Task 10
- [x] 3.3.3 配置文件名 → Task 11
- [x] 3.3.4 二进制名/CLI 命令名 → Task 12
- [x] 3.3.5 HTTP 认证用户名 → Task 13
- [x] 3.3.6 mDNS → Task 14
- [x] 3.3.7 数据库/日志文件名 → Task 15
- [x] 3.3.8 OTEL 观测标识 → Task 3
- [x] 3.3.9 User-Agent/Referer → Task 16
- [x] 3.3.10 桌面 App 标识 → Task 18 (可选)
- [x] 3.3.11 系统级配置路径 → Task 17
- [x] 3.3.12 Shell argv0 → Task 17
- [x] 4. 构建与分发 → Task 19
- [x] 5. Fork 仓库管理与 rebase 策略 → Task 1

### Placeholder Scan

无 TBD/TODO。所有步骤包含具体代码或命令。

### Type Consistency

- `Account.Service` 的 no-op 实现返回类型与 Interface 定义一致（`Effect.Effect<Option.Option<...>, AccountError>`）
- `upgrade()` 保持 `async` 签名
- `loggers()` 返回 `[]` 与原返回类型 `OtlpLogger[]` 一致
- `tracingLayer()` 返回 `Layer.empty` 与原返回类型 `Layer.Layer<...>` 一致

### Scope Check

19 个任务覆盖 ~30-40 个文件改动，适合单个实现计划。Task 18 标记为可选，可根据需要跳过。
