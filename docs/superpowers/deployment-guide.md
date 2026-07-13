# mycode 部署指南

本文档说明如何在新机器上部署和使用 mycode（mycode 是 opencode 的私有化版本）。

## 系统要求

| 组件 | 要求 |
|---|---|
| 操作系统 | Windows 10/11（64-bit） |
| bun.exe | 已在仓库根目录（98MB），无需单独安装 |
| 磁盘空间 | 至少 1GB（源码 + 依赖 + 缓存） |
| 内存 | 至少 4GB（AI 调用 + TUI） |
| 公司环境 | 联软 UniAccess EDR 已加 bun.exe 白名单（联软网络 hook 放行） |

## 部署步骤

### 1. clone 仓库

```powershell
git clone https://github.com/feng4278853/opencode.git mycode
cd mycode
git checkout my-opencode-dec
```

### 2. 检查 bun.exe

仓库根目录应包含 `bun.exe`（98MB）。如果缺失或被杀毒软件误删：

```powershell
# 从 D:\npm-tools\bun\node_modules\bun\bin\bun.exe 复制
copy "D:\npm-tools\bun\node_modules\bun\bin\bun.exe" ".\bun.exe"
```

### 3. 安装依赖

```powershell
bun install --ignore-scripts
```

`-ignore-scripts` 跳过 native binary build（tree-sitter 等），只装 JS 依赖。

### 4. 配置（首次使用）

```powershell
# 创建配置目录
mkdir "$env:USERPROFILE\.config\mycode"

# 创建 mycode.jsonc（复制粘贴以下内容并填入 AI 凭证）
@"
{
  "lsp": true,
  "provider": {
    "GLM": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "GLM Provider",
      "options": {
        "baseURL": "https://open.bigmodel.cn/api/coding/paas/v4",
        "apiKey": "<你的 API key>"
      },
      "models": {
        "GLM-5.2": {
          "name": "GLM-5.2",
          "limit": { "context": 1000000, "output": 131072 }
        }
      }
    }
  },
  "plugin": [
    "superpowers@git+https://github.com/obra/superpowers.git",
    "oh-my-openagent@latest"
  ]
}
"@ | Out-File -Encoding utf8 "$env:USERPROFILE\.config\mycode\mycode.jsonc"
```

### 5. 加入 PATH

把 `mycode` 仓库根目录加到系统 PATH：

```powershell
$path = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$path;F:\Git\my-open-code\opencode", "User")
```

重启 PowerShell 即可使用 `mycode` 命令。

### 6. 验证

```powershell
mycode --version
# 预期输出: 1.0.0 (或 local)

mycode run "say hi"
# 预期: AI 正常响应
```

## 使用方式

```powershell
# 启动 TUI 交互模式
mycode

# 非交互模式
mycode run "解释这段代码"

# 升级命令已禁用
mycode upgrade
# 预期: "Upgrade is disabled in this build"
```

## 配置位置

| 配置 | 路径 | 作用 |
|---|---|---|
| 主配置 | `~/.config/mycode/mycode.jsonc` | provider、mcp、plugin 列表 |
| oh-my-openagent | `~/.config/mycode/oh-my-openagent.json` | agent model 映射 |
| TUI 配置 | `~/.config/mycode/tui.json` | TUI 主题、按键绑定 |
| 凭证 | `~/.local/share/mycode/auth.json` | API 凭证（不放入主配置） |
| 数据库 | `~/.local/share/mycode/mycode.db` | 会话历史 |
| 日志 | `~/.local/share/mycode/log/mycode.log` | 运行日志 |
| 插件缓存 | `~/.cache/mycode/packages/` | npm/git 拉取的插件 |

## EDR 兼容性

mycode 通过 `mycode.bat` 启动，内部调用仓库根目录的 `bun.exe`（98MB）。

**为什么 bun.exe 不被联软 EDR 损坏**：
- 联软 UniAccess 的网络 hook（MozartBreathBolo2.dll 等）对进程名 `bun.exe` 默认放行（白名单）
- 用其他名字（如 `mycode.exe`、`bun-mycode.exe`）会触发 hook 拦截，崩溃
- 切勿改 `mycode.bat` 让它调用其他名字的 exe

如果公司移除了 bun.exe 的白名单，整个方案失效，需要走远程服务器方案（见 `update-procedure.md`）。

## 升级

### 升级 oh-my-openagent

```powershell
# 手动强制升级到最新版本
rd /s /q "$env:USERPROFILE\.cache\mycode\packages\oh-my-openagent@latest"
mycode run "hi"
```

下次启动时自动从 npm 拉取最新版。

### 升级 superpowers

```powershell
rd /s /q "$env:USERPROFILE\.cache\mycode\packages\superpowers@git+https_"
mycode run "hi"
```

### 同步上游 opencode

```powershell
cd F:\Git\my-open-code\opencode
git fetch upstream
git rebase upstream/dev
```

如有冲突，参考 `docs/superpowers/update-procedure.md`。

### 升级 bun

如果 `D:\npm-tools\bun\node_modules\bun\bin\bun.exe` 升级了：

```powershell
# 同步到项目内
copy "D:\npm-tools\bun\node_modules\bun\bin\bun.exe" "F:\Git\my-open-code\opencode\bun.exe"
```

## 与上游 opencode 的区别

| 维度 | opencode | mycode |
|---|---|---|
| 进程名 | opencode.exe | bun.exe（白名单） |
| 配置目录 | `~/.config/opencode/` | `~/.config/mycode/` |
| 数据目录 | `~/.local/share/opencode/` | `~/.local/share/mycode/` |
| 缓存目录 | `~/.cache/opencode/` | `~/.cache/mycode/` |
| 自动升级 | ✅ npm/brew/choco/scoop | ❌ 已禁用 |
| 账户云端 | ✅ opencode cloud | ❌ 已禁用 |
| 会话分享 | ✅ opncd.ai | ❌ 已禁用 |
| OTLP 遥测 | ✅ 发送 | ❌ 已禁用 |

## 常见问题

### mycode 启动后崩溃

检查 `bun.exe` 是否在联软白名单中。运行 `mycode --version`，如果直接报 Bun 崩溃日志，说明白名单失效。

### "Cannot find module" 错误

需要重新安装依赖：
```powershell
bun install --ignore-scripts
```

### mycode.jsonc 出现重复的 `$schema` 字段

这是旧版本的 bug，已修复。如果出现，删除所有重复行保留一行。

### 升级 opencode 后类型错误

```powershell
cd F:\Git\my-open-code\opencode\packages\opencode
bun typecheck
```

通常 rebase 冲突未正确解决导致。查看 `docs/superpowers/update-procedure.md` 的"冲突高发区域预判"。

## 文档索引

- `docs/superpowers/specs/2026-07-12-opencode-privatization-design.md` —— 私有化设计文档
- `docs/superpowers/plans/2026-07-12-opencode-privatization.md` —— 实施计划
- `docs/superpowers/update-procedure.md` —— 升级流程（含插件升级、Bun 同步）