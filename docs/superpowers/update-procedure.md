# mycode-v2 版本更新流程（opencode v2 专用）

本文档说明如何在官方 opencode **v2**（`packages/cli` 2.0.x 架构）发布新版本时，把 mycode-v2 的私有化改动同步过去。
**创建于 2026-09-22，基于 v2.0.12 首次私有化改造的实战全过程**，所有坑都踩过并写进了对应章节。
v1（1.18.x 架构）的升级流程在 `../../opencode/docs/superpowers/update-procedure.md`，两份文档不通用。

## 背景

| 项 | 值 |
|---|---|
| 仓库 | `F:\Git\my-open-code\opencode-v2`，分支 `my-opencode-v2` |
| remote | `origin` = feng4278853/opencode（fork）、`upstream` = anomalyco/opencode |
| 基线 | v2.0.12（上游 commit `9d531435b4` 附近） |
| 私有化提交（7 个，见 `git log --oneline 9d531435b4..HEAD`） | ① 主体改造（改名/云摘除/更新禁用）② 构建验证+wrapper ③ sparkline+弹窗移植 ④⑤⑥ TUI 品牌化+sparkline 渲染修复+wordmark |
| runtime | **bun 1.4.2**（v2 上游要求 1.4.x，勿降级） |

## v2 与 v1 的结构差异（升级时最容易踩的认知坑）

1. **包 scope 是 `@opencode/*`**（29 个包，非 v1 的 `@opencode-ai/*`）——内部标识，**有意保留不改**
2. **XDG 根/遥测在 `packages/util/src/`**（不是 v1 的 `core/src/global.ts`）：`global.ts:12` `const app`、`observability.ts:27` client、`logging.ts` 日志名
3. **OTLP 默认关闭**（需 `OTEL_EXPORTER_OTLP_ENDPOINT` 才启用）——v2 无 posthog/sentry
4. **share 功能已死**；云端登录收缩为单个插件 `packages/core/src/plugin/provider/opencode.ts`（已删除 + `provider.ts` 与 `plugin/internal.ts` 的注册/guarded 引用同步摘除）
5. **配置文件**：全局 `~/.config/mycode/cli.json`（不是 tui.json；v1 的 tui.json 会被自动迁移）；项目级 `mycode.json(c)`（`core/src/config/discovery.ts:11`）
6. **DB 文件名**：`packages/cli/src/database-path.ts`（`mycode.db` / `mycode-<channel>.db`）
7. **模型目录**：`core/src/models-dev.ts:282` 默认源——上游用 `models.opencode.ai`，**已改回 `models.dev`**，升级后必须复查此行
8. **事件名变了**：`session.error` → `session.execution.failed`；`question.asked` → `form.created`（fields 用 `title` 不是 question）；`permission.asked` 不变但字段是 `action`+`resources`（不是 v1 的 permission/patterns）

## 硬约束（与 v1 相同）

1. 私有化改动 100% 保留（见下方 marker 清单）
2. 运行时网络白名单：仅模型端点（bigmodel）+ 插件源（npm/GitHub）+ localhost + models.dev（模型目录）。**opencode 官方域（opencode.ai 全部子域、opncd.ai）交互必须为 0**

## 升级流程（9 步）

### Step 1：备份

```powershell
git tag backup-v2-$(Get-Date -Format "yyyyMMdd"); git push origin backup-v2-$(Get-Date -Format "yyyyMMdd")
```

### Step 2：拉取上游

```powershell
git fetch upstream --tags   # 网络不通先开 dev-sidecar（系统代理 127.0.0.1:31181）
```

目标选**最新 v2 release tag**（`git tag -l --sort=-v:refname "v2.*" | head -5`），不追 dev 裸顶端。

### Step 3：差距评估

```powershell
git log --oneline 9d531435b4..v2.0.xx | Measure-Object -Line
# 高危文件（私有化触碰过、上游也常改的）：
git diff --stat 9d531435b4..v2.0.xx -- packages/util/src/global.ts packages/core/src/config/discovery.ts packages/cli/src/database-path.ts packages/core/src/plugin/provider.ts packages/core/src/plugin/internal.ts packages/core/src/models-dev.ts packages/cli/src/services/updater.ts packages/core/src/app.ts packages/tui/src/attention.ts packages/tui/src/feature-plugins/system/notifications.ts packages/tui/src/feature-plugins/sidebar/context.tsx packages/cli/script/build.ts packages/cli/src/commands/commands.ts
# 上游新增 opencode 官方域（网络审计输入）：
git diff 9d531435b4..v2.0.xx | Select-String "^\+.*(opencode\.ai|opncd\.ai)"
```

### Step 4：rebase 或重放

私有化提交少（7 个）且集中，两种方式任选：

- **rebase**：`git rebase --onto v2.0.xx 9d531435b4 my-opencode-v2`（注意 rebase 中 ours=上游、theirs=自己）
- **重放**：新建分支到新 tag，按下面 marker 清单逐项重做（v2 改动点集中，重放约 1-2 小时）

冲突处理原则：
- `global.ts` / `app.ts` / `database-path.ts` / `discovery.ts`：保留 mycode 字样，合入上游新逻辑
- `provider.ts` / `internal.ts`：保留 OpencodePlugin 的删除（上游大概率仍在演进这个插件）
- `updater.ts`：保留 `release()` 的短路失败 + `if (true)` 前置守卫写法（**不要**改成提前 return——Effect 的类型收窄会炸出 2 个下游 never 错误）
- `attention.ts` / `notifications.ts` / `context.tsx`：保留我方版本，上游新事件/新面板手工合并
- `models-dev.ts`：保留 `models.dev` 默认源

### Step 5：安装依赖 ⚠️ 本次升级最大坑，按此顺序操作

```powershell
# 0. 清理残留 bun 进程（互抢文件锁会互卡）
Get-Process bun -ErrorAction SilentlyContinue | Where-Object Id -ne <其他用途的PID> | Stop-Process -Force

# 1. 必须带 --frozen-lockfile！普通 install 会陷入解析死循环（CPU 空转数小时无输出）
bun install --ignore-scripts --frozen-lockfile
```

- 上游 tag 自带配套 `bun.lock`，frozen 直接照抄安装，**跳过解析泥潭**
- 若上游 lockfile 与 bunfig 冲突：bunfig.toml 的 `minimumReleaseAge` 已注释掉（# 私有化：禁用），保持注释状态
- **npmmirror 镜像有坏包**（`@kobalte/core` tarball 404/损坏）。卡住时的解法：
  ```powershell
  # 临时全局切官方源（装完可切回）
  bun config set registry https://registry.npmjs.org
  ```
- **装完必查空壳包**：frozen 安装会留空目录（本次 541 个！），typecheck 报 MODULE_NOT_FOUND 就是它：
  ```powershell
  # 删空壳后补装
  cmd /c "for /d /r %i in (*) do @if @%~zi==0 echo %i"   # 或用 git bash: find packages/*/node_modules node_modules -maxdepth 3 -type d -empty
  find packages/*/node_modules node_modules -maxdepth 3 -type d -empty -delete
  bun install --ignore-scripts   # 普通模式此时能秒过（lock 已满足，只补空壳）
  ```

### Step 6：typecheck

```powershell
cd packages\cli
bun run typecheck        # 基线：0 错误
```

新增错误的三个惯犯：
1. `updater.ts` 短路写法被破坏 → 恢复 `if (true)` 守卫 + `data.metadata!.package!` 断言（见 Step 4 冲突原则）
2. 摘除的 OpencodePlugin 有新引用 → 全库 grep `OpencodePlugin|provider/opencode` 清零
3. 空壳包 MODULE_NOT_FOUND → 回 Step 5 补装

### Step 7：重新审计上游增量（每次必做）

```powershell
# A. opencode 官方域新增点
git diff 9d531435b4..HEAD -- packages/core/src packages/cli/src packages/tui/src | Select-String "^\+.*opencode\.ai"
# B. 品牌残留（用户可见面）
git grep -inE "OpenCode|opencode\.(json|local|ai)" packages/cli/src packages/tui/src --include="*.tsx" --include="*.ts" | Select-String -NotMatch "@opencode/|OPENCODE_|opencode-ai|opencode\.(settings|status|update|debug|default|mode)|keybind"
# C. 新增回传路径：对照官方域清单逐个确认无运行时可达（被 stub/未注册不算可达）
```

上游 6 周增量里的已知模式：新 provider 插件（带 `opencode.ai` 文档链接，改链接或留着——仅文档字符串）、新 UI 文案（sed 替换）、新事件（notifications.ts 考虑要不要订阅）。

### Step 8：构建 + 冒烟

```powershell
cd packages\cli
# 1. 先关掉所有运行中的 mycode.exe（否则 dist 被占用 EPERM 删不掉）
Get-Process mycode -ErrorAction SilentlyContinue | Stop-Process -Force
# 2. 构建（--skip-web-ui 必带：Web UI 内嵌构建在 Windows 上因依赖空壳/体积问题不可靠，CLI-only 不需要它）
$env:OPENCODE_VERSION = "1.0.0"
bun run script/build.ts --single --skip-install --skip-web-ui
# 预期：Smoke test passed: 1.0.0，产物 dist/cli-windows-x64/bin/mycode.exe（约 171-180MB）
.\dist\cli-windows-x64\bin\mycode.exe --version      # mycode v1.0.0
.\dist\cli-windows-x64\bin\mycode.exe --help         # 首屏零 opencode 残留
```

### Step 9：运行时验证

```powershell
# 仓库根目录（mycode-v2.bat 已含全部保护：遥测禁用+模型禁拉+INIT_CWD+段错误重试+stderr捕获）
mycode-v2 run "reply with exactly: OK-UPGRADE"
# 预期：GLM 正常响应
```

**网络验证**（另开终端，运行期间采样）：
```powershell
netstat -ano | findstr "ESTABLISHED" | findstr <mycode.exe 的 PID>
# 预期：仅 open.bigmodel.cn 的 IP（可用 Resolve-DnsName open.bigmodel.cn 比对）
# 若出现 models.dev IP（104.26.x / 172.67.x）：说明没走 mycode-v2.bat（缺 OPENCODE_DISABLE_MODELS_FETCH=1）
```

## 私有化 marker 清单（升级后逐条核验）

```powershell
# 数据层
Select-String -Path "packages\util\src\global.ts" -Pattern 'const app = "mycode"'
Select-String -Path "packages\core\src\config\discovery.ts" -Pattern '"mycode.json", "mycode.jsonc"'
Select-String -Path "packages\cli\src\database-path.ts" -Pattern "mycode.db"
Select-String -Path "packages\util\src\observability\logging.ts" -Pattern "mycode.log"
# 云摘除
Test-Path "packages\core\src\plugin\provider\opencode.ts"          # 预期 False
Select-String -Path "packages\core\src\plugin\provider.ts" -Pattern "OpencodePlugin"  # 预期无匹配
Select-String -Path "packages\core\src\plugin\internal.ts" -Pattern "OpencodePlugin"  # 预期无匹配
# 模型目录 & 更新
Select-String -Path "packages\core\src\models-dev.ts" -Pattern "models\.dev"          # 预期有
Select-String -Path "packages\core\models-dev.ts" -Pattern "models\.opencode\.ai"      # 预期无
Select-String -Path "packages\cli\src\services\updater.ts" -Pattern "Updates are disabled in this build"  # 预期有
# 身份
Select-String -Path "packages\core\src\app.ts" -Pattern "mycode/`$\{app.channel\}"
Select-String -Path "packages\cli\script\build.ts" -Pattern 'const binary = "mycode"'
Select-String -Path "packages\cli\script\build.ts" -Pattern "OPENCODE_CLI_NAME: ""'mycode'"""
# TUI 品牌 & 自研
Select-String -Path "packages\tui\src\attention.ts" -Pattern "windowsToast"            # 预期有
Select-String -Path "packages\tui\src\attention.ts" -Pattern 'DEFAULT_TITLE = "mycode"'
Select-String -Path "packages\tui\src\feature-plugins\sidebar\context.tsx" -Pattern "sparkColor"  # sparkline
Select-String -Path "packages\tui\src\logo.ts" -Pattern "█▀▀█ █__█ █▀▀▀"              # MYC 像素字形
# 网络白名单最终确认
rtk git grep -nE "models\.opencode\.ai|console\.opencode\.ai" -- packages/core/src packages/cli/src  # 预期无匹配
```

## 运行时配置（每台机器）

- `~/.config/mycode/cli.json`：`{ "attention": { "notifications": true, "sound": true, "volume": 0.4 } }`（弹窗+声音开关，v2 读 cli.json 不读 tui.json）
- `~/.config/mycode/mycode.jsonc`：provider/插件（v1/v2 共用，v2 自动兼容 v1 格式）
- 入口：`mycode-v2.bat`（勿直接跑 exe——模型禁拉、段错误重试、stderr 捕获都在 wrapper 里）
- 点击弹窗聚焦依赖 `mycode://` 协议 + `~/.cache/mycode/notify/` 产物——首次弹窗自动生成/注册，无需配置
- **共享目录说明**：v1（源码模式，DB=`mycode-local.db`）与 v2（exe，DB=`mycode.db`）共用 `~/.config|local|cache/mycode` 但数据库天然错开；**不要**让两边交换运行模式（v2 别用源码跑、v1 别编译成 latest channel），否则 DB 迁移可能互相污染

## 已知遗留（下次升级顺带检查）

1. 子命令 handler 内约 47 行 "OpenCode" 次级文案（`--help` 首屏已干净，子命令 help 仍有）
2. `mini/theme.ts` 的 `getOpenCodeTheme` 等内部函数名（不显示，低优先）
3. 上游若恢复 share 功能或新增云端功能，需按 v1 模式重新摘除
4. Web UI 内嵌（`--skip-web-ui` 跳过的部分）从未在私有化分支验证过；要启用需先修 dagre-d3-es 空壳依赖并做独立网络审计
5. 桌面端（Electron）：**明确不支持**——EDR 白名单不含其进程名，品牌/更新器/网络均未审计

## 回滚

```powershell
git reset --hard backup-v2-<日期>
git push --force-with-lease origin my-opencode-v2
```

## 文档索引

- `../../opencode/docs/superpowers/update-procedure.md` —— v1 升级流程（ Bun 升级解决 EDR 竞态崩溃的经验在那里）
- `../../opencode/docs/superpowers/deployment-guide.md` —— v1 部署指南
- `../../opencode/docs/superpowers/upgrade-v1.18.21.md` —— v1 存量升级指南
