# mycode 升级指南：v1.17.18 → v1.18.21

> 适用对象：已经在使用 mycode 的同事（机器上已有仓库、`bun.exe`、配置和插件缓存）。
> 发布日期：2026-08-24。本次升级基线：上游 opencode `v1.18.21`。

## 本次升级带来什么

- 跟随上游 603 个提交（v1.17.19 ~ v1.18.21，约 6 周）：会话压缩保留完整近期轮次、网络错误自动重试、`mycode run` 中 subagent 权限请求修复、MCP 连接修复、大量 provider 修复等
- 私有化改动全部保留（改名、云功能/遥测摘除、TUI cache hit rate 趋势图），运行时网络出口验证：仅模型端点，无任何 opencode 官方服务器交互
- 详见 `update-procedure.md` 文末「升级记录」

## ⚠️ 为什么不能用 `git pull`

本次升级把 39 个历史提交压缩重写成了 8 个主题提交，远端分支历史与本地旧历史**已分叉**。普通 `git pull` 会尝试合并新旧两套历史，产生大量冲突。**必须用 `git reset --hard` 对齐远端**（下面的步骤已包含）。

## 升级步骤

在 mycode 仓库目录（如 `F:\Git\my-open-code\opencode`）打开 PowerShell，依次执行：

```powershell
# 0. 确认没有本地改动（输出应为空；有改动先自行 stash 或备份）
git status

# 1. 拉取远端最新
git fetch origin

# 2. 切到主分支并对齐远端（历史已重写，必须 reset，不能 pull）
git checkout my-opencode-dec
git reset --hard origin/my-opencode-dec

# 3. 重装依赖（依赖树有变化，跳过这步会报 "Cannot find module"）
bun.exe install --ignore-scripts

# 4. 验证
mycode --version
# 预期输出: 1.0.0

mycode run "hi"
# 预期: AI 正常响应；TUI 侧栏 Context 面板能看到 cache hit rate 彩色趋势条
```

**零改动项**——以下内容全部原地兼容，不需要任何操作：

| 项 | 说明 |
|---|---|
| `bun.exe`（仓库根目录） | 无需更换，v1.3.14 正是上游要求版本 |
| `~/.config/mycode/mycode.jsonc` | 兼容（新版本对未知配置字段更宽容） |
| `~/.local/share/mycode/auth.json` | 沿用 |
| `mycode.db` 会话历史 | 兼容（上游明确保留 v1 数据库兼容），历史会话不丢 |
| 插件缓存 `~/.cache/mycode/packages` | 沿用，不会重新下载 |
| PATH / EDR / `mycode.bat` | 无变化 |

## 常见问题

**Q: `git reset --hard` 会不会丢我的东西？**
只影响仓库内的 git 跟踪文件。你的配置、凭证、会话、插件缓存都在 `~` 目录下，不受影响。执行前 `git status` 确认仓库内无未提交改动即可。

**Q: 运行报 "Cannot find module"**
第 3 步依赖没装或被中断，重跑 `bun.exe install --ignore-scripts`。

**Q: 启动直接崩溃 / Bun 崩溃日志**
检查仓库根目录 `bun.exe` 是否还在（98MB）且**文件名必须是 `bun.exe`**——EDR 白名单按进程名放行，不能改名。

**Q: 想回退到旧版**
```powershell
git fetch origin
git reset --hard backup-20260824    # 升级前的原始状态（远端已备份）
bun.exe install --ignore-scripts
```

## 相关文档

- `update-procedure.md` —— 维护者的升级流程与本次升级审计记录
- `deployment-guide.md` —— 新机器首次部署（本文件只覆盖存量升级）
