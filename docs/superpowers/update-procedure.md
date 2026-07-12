# mycode 版本更新流程

本文档说明如何在上游 opencode 发布新版本时，把自定义的 mycode 改动同步到新版本。

## 背景

- **上游**：`anomalyco/opencode` 的 `dev` 分支（默认分支）
- **fork**：`feng4278853/opencode` 的 `my-opencode-dec` 分支
- **当前基点**：`34e580905` (feat(tui): show idle session directory #36457)
- **自定义 commits**：13 个，覆盖以下改动
  - 路径/身份重命名（opencode → mycode）
  - 云端功能移除（account/share/console/enterprise/github-import）
  - OTLP/自动更新禁用
  - CLI 帮助文本 + scriptName 重命名
  - TUI logo 改为 MYCODE
  - `mycode.bat` wrapper 脚本
  - 根 tsconfig.jsxImportSource 配置

## 一次性配置（已完成）

```powershell
rtk git remote add upstream https://github.com/anomalyco/opencode.git
```

## 日常更新流程

### Step 1：备份当前状态

```powershell
# 打标签作为回滚点
rtk git tag backup-$(Get-Date -Format "yyyyMMdd")
```

### Step 2：拉取上游最新

```powershell
rtk git fetch upstream
```

查看上游有什么新改动：

```powershell
# 看自上次基点后的新 commits
rtk git log --oneline 34e580905..upstream/dev
```

### Step 3：Rebase 自定义改动到上游最新

```powershell
# 确保在自定义分支
rtk git checkout my-opencode-dec

# rebase 到上游 dev 的最新
rtk git rebase upstream/dev
```

### Step 4：解决冲突（如果有）

rebase 会逐个 replay 你的 13 个 commit。如果上游改了你改过的同一文件，会停下来让你解决冲突。

```powershell
# 查看冲突文件
rtk git status

# 解决冲突的两种策略：
```

**策略 A：保留你的改动（推荐用于核心私有化文件）**

打开冲突文件，保留 `<<<<<<< HEAD` 到 `=======` 的部分（你的改动），删除上游冲突部分。

```powershell
rtk git add <冲突文件>
rtk git rebase --continue
```

**策略 B：接受上游版本，稍后重新应用文本替换（用于 CLI 描述等大量散落的字符串）**

```powershell
# 接受上游版本，跳过这个 commit 的冲突
rtk git checkout --theirs .
rtk git add -A
rtk git rebase --continue
```

rebase 完成后，参考下文「重新应用文本替换」一节。

**其他命令：**

```powershell
# 完全放弃这次 rebase，回到 rebase 前的状态
rtk git rebase --abort

# 跳过当前 commit（会丢失该 commit 的改动，慎用）
rtk git rebase --skip
```

### Step 5：验证

```powershell
$env:PATH = "D:\npm-tools\bun;" + $env:PATH

# 1. 安装依赖（如果上游改了 package.json）
bun install --ignore-scripts

# 2. typecheck
cd packages\opencode
bun typecheck
# 预期：仅 6 个上游预先存在的错误，不应出现新的 mycode 相关错误

# 3. 构建
$env:OPENCODE_VERSION = "1.0.0"
bun run script/build.ts --single --skip-install
# 预期：Smoke test passed: 1.0.0

# 4. 运行验证
.\dist\opencode-windows-x64\bin\mycode.exe --version
.\dist\opencode-windows-x64\bin\mycode.exe --help | Select-String "mycode|opencode"
# 预期：全部显示 mycode，无 opencode 残留

# 5. 源码模式验证（wrapper 使用的模式）
cd F:\Git\my-open-code\opencode
mycode run "hi"
# 预期：AI 正常响应
```

### Step 6：强制推送到 fork

rebase 会改变 commit hash，必须强制推送：

```powershell
rtk git push --force-with-lease origin my-opencode-dec
```

> `--force-with-lease` 比 `--force` 安全：如果远程有别人推送的新 commit 会拒绝。

### Step 7：更新基点记录

rebase 成功后，更新本文档顶部的「当前基点」为新 commit hash：

```powershell
# 查看新的基点
rtk git merge-base HEAD upstream/dev
```

## 冲突高发区域预判

| 自定义 commit | 改的文件 | 冲突风险 | 建议策略 |
|---|---|---|---|
| 路径重命名 | `packages/core/src/global.ts` | **高** | 手动解决，保留 mycode 路径 |
| 身份重命名 | `packages/opencode/script/build.ts` | **高** | 手动解决，保留 mycode 标识 |
| 云端功能移除 | `packages/opencode/src/account/account.ts` | **中** | 看上游是否新增了依赖 account 的代码 |
| CLI 文本替换 | `packages/opencode/src/cli/cmd/*.ts`（45 个文件） | **高** | 接受上游版本，重新跑文本替换脚本 |
| logo 改动 | `packages/tui/src/logo.ts` | **低** | 手动解决 |
| tsconfig 配置 | `tsconfig.json` | **中** | 手动解决，保留 jsxImportSource |

## 重新应用文本替换（备查脚本）

如果 rebase 后需要重新执行 opencode → mycode 的文本替换，保存以下内容为 `F:\Git\my-open-code\opencode\rename.ps1` 并执行：

```powershell
# rename.ps1 - 重新执行 opencode → mycode 的用户可见文本替换
# 仅替换用户可见字符串，不触碰：
#   - @opencode-ai/* 包名
#   - OPENCODE_* 环境变量
#   - opencode-ai npm 包名
#   - 内部代码标识符（变量名、函数名、TypeId 等）

# 1. scriptName（CLI 入口）
$entryFiles = @(
    "packages\opencode\src\index.ts",
    "packages\opencode\src\temporary.ts"
)
foreach ($f in $entryFiles) {
    if (Test-Path $f) {
        (Get-Content $f -Raw) -replace '\.scriptName\("opencode"\)', '.scriptName("mycode")' |
            Set-Content $f -NoNewline
    }
}

# 2. CLI help text - 只替换 describe/message 等用户可见字符串
# 注意：这个脚本用正则做粗略替换，rebase 后需手动复查
Get-ChildItem -Recurse "packages\opencode\src\cli\cmd" -Filter "*.ts" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    # 简化策略：只替换双引号和反引号内的 opencode 字符串
    $new = $content `
        -replace 'describe: "([^"]*?)opencode([^"]*?)"', 'describe: "$1mycode$2"' `
        -replace 'message: "([^"]*?)opencode([^"]*?)"', 'message: "$1mycode$2"'
    if ($content -ne $new) {
        Set-Content $_.FullName -Value $new -NoNewline
        Write-Output "Updated: $($_.FullName)"
    }
}

# 3. TUI logo（如果上游重写了 logo.ts，需要手动改回 MYCODE）
# 参考 commit bacc65ba3 的改动

Write-Output "完成。请运行 typecheck 和 build 验证。"
```

> **注意**：此脚本是粗略替换，rebase 后一定要跑一遍 typecheck + build + 运行时验证。如果 typecheck 报错，可能是脚本误改了内部标识符，手动回滚即可。

## 回滚

如果 rebase 后发现问题无法解决：

```powershell
# 回滚到 rebase 前的标签
rtk git reset --hard backup-<日期>
rtk git push --force-with-lease origin my-opencode-dec
```

## 关键文件清单

以下是 mycode 自定义改动涉及的核心文件，rebase 时重点关注：

```
# 构建与启动
mycode.bat                                    # wrapper 脚本（新增文件）
tsconfig.json                                 # jsxImportSource 配置
packages/opencode/script/build.ts             # 二进制名、UA、CLI_NAME

# 核心私有化
packages/core/src/global.ts                   # XDG root: app="mycode"
packages/core/src/observability/otlp.ts       # OTLP 禁用
packages/opencode/src/cli/upgrade.ts          # 升级检查 no-op
packages/opencode/src/account/account.ts      # account no-op layer
packages/opencode/src/share/share-next.ts     # share 禁用
packages/opencode/src/config/config.ts        # 配置加载（移除 account sync）

# CLI 界面
packages/opencode/src/index.ts                # scriptName("mycode")
packages/opencode/src/cli/cmd/*.ts            # 帮助文本（45 个文件）
packages/opencode/src/cli/cmd/github.handler.ts  # 已清空 export {}
packages/opencode/src/cli/cmd/github.ts       # 已清空 export {}
packages/opencode/src/cli/cmd/import.ts       # 已清空 export {}

# TUI
packages/tui/src/logo.ts                      # MYCODE pixel art
packages/tui/src/util/presentation.ts         # session epilogue wordmark

# 文档
docs/superpowers/specs/2026-07-12-opencode-privatization-design.md
docs/superpowers/plans/2026-07-12-opencode-privatization.md
docs/superpowers/update-procedure.md          # 本文档
```

## 运行环境依赖

| 工具 | 路径 | 用途 |
|---|---|---|
| Bun | `D:\npm-tools\bun` | 运行源码模式 + 构建 |
| Git | 系统 PATH | 版本管理 |
| RTK | `D:\rtk` | Git 输出压缩（可选） |

mycode wrapper (`mycode.bat`) 已硬编码 Bun 路径。如果 Bun 迁移到其他位置，需要同步更新 `mycode.bat`。
