# mycode 版本更新流程

本文档说明如何在上游 opencode 发布新版本时，把自定义的 mycode 改动同步到新版本。
**2026-08-23 基于分支全部 39 个自定义提交逐一核实重写；2026-08-24 完成首次按本文档流程的升级（v1.17.18 → v1.18.21），升级记录见文末。** 文中行号以写作时的代码树为准，升级后会漂移，以内容匹配为准。

## 背景

- **上游**：`anomalyco/opencode`（原 sst/opencode → opencode-ai/opencode，组织迁移后的现归属），发布版本以 `v` 开头的 release tag 标记
- **fork**：`feng4278853/opencode` 的 `my-opencode-dec` 分支（2026-08-24 起升级工作在 `my-opencode-20260823` 分支进行）
- **当前基点**：`v1.18.21`（`826d9ad46a`，release: v1.18.21，2026-08-21）
- **自定义提交：6 个主题提交**（2026-08-24 由原始 39 个提交压缩而来，历史明细保留下方仅作考古参考）：
  1. `docs: privatization design, plans, update procedure, deployment guide`
  2. `feat(tui): cache hit rate sparkline in context sidebar`
  3. `fix(mycode): wrapper, cwd preservation and build config`
  4. `feat: disable cloud and telemetry for privatized build`
  5. `refactor: rename opencode to mycode`
  6. `fix: keep models catalog source at models.dev to avoid opencode.ai contact`

- **原始 39 个提交的主题分布**（历史记录，已压缩进上述 6 个主题提交）：
  1. **遥测/回传禁用**：`0348d0cc8`（自动更新检查 + OTLP）、`896fd853c`（网络后门与 EDR 可检测字符串，横跨 20 文件）、`af091370d`（oh-my-openagent PostHog 禁用，`OMO_*` 环境变量）
  2. **云端功能摘除**：`571881b3d`（provider/share/account/console/enterprise）、`6e3f0d160`（删 github/import 命令 + 修连锁类型错误）
  3. **路径/配置改名**：`f9a162ad4`（XDG 根、`.opencode`→`.mycode`）、`a04dff66b`（opencode.json 残留引用）、`cba2190ce`（修复 $schema 重复注入）
  4. **身份字符串改名**：`a607de72b`（binary/auth/mDNS/DB/UA/shell/managed 路径）、`09aa2bcbd`（scriptName）、`048db7f24`（CLI help 文本）
  5. **TUI 品牌**：`bacc65ba3`（像素 MYCODE）、`efaedf09e`（启动页文字 wordmark）、`95d962550`（终端标题/横幅）、`45aefad5a`/`8b51c5f40`/`5dc157f0a`（侧栏/错误组件/sidebar_footer 剩余字符串）
  6. **TUI cache sparkline（自研功能，全部在 `packages/tui/src/feature-plugins/sidebar/context.tsx`）**：`6fd09a02b` → `fdbc56dc4`（公式修正）→ `7d7f36fa4`（last/cum 命中率+趋势）→ `8b21ed336`（分段着色+min/max）→ `e8a11785e`（实心块条）
  7. **wrapper/cwd 修复**：`2c968a0aa`、`f6750716d`、`466532219`、`a1ef18889`、`e5170aa7e`——**方案是启动时 `process.chdir(INIT_CWD)` 统一恢复调用者目录，只改了 `mycode.bat` + `packages/opencode/src/index.ts` 两个文件，不是逐调用点修改**
  8. **构建/杂项/文档**：`7101689ca`（根 tsconfig jsx/jsxImportSource）、`5320e6321`（.husky/pre-push 简化 + .codegraph）、`e3ad5d853`（忽略 bun.exe）、5 个文档提交、1 个 merge

- **总量**：155 文件，+5569/−8645（其中 bun.lock ±6357、文档 +1888、真实代码改动约 +530/−3718）

## 两条硬约束（升级时不可违背）

### 约束 1：私有化改动 100% 保留

所有改名、摘除、自研功能在升级后必须逐项可验证地存在。验证手段见下文「私有化保全审计」章节：marker 清单核验 + 逐 hunk 对照，不允许出现"静默丢失"。

### 约束 2：运行时网络出口白名单制（deny-by-default）

mycode **运行时**只允许与以下地址公网交互：

| 类别 | 允许的地址 | 说明 |
|---|---|---|
| 模型 API | mycode.jsonc 中配置的 provider 端点（当前为 `open.bigmodel.cn`） | 唯一的 AI 流量出口 |
| 插件源 | `registry.npmjs.org`（oh-my-openagent）、`github.com`（superpowers git 拉取） | 仅插件安装/升级时 |
| 本地 | `localhost` / `127.0.0.1` / mDNS | 本地 server 与 `mycode.local` |

**禁止一切 opencode 相关交互**（连接数必须为 0）：

- `*.opencode.ai`（含 console.*、auth、account 同步）
- `*.opncd.ai`（会话分享）
- Sentry / 任何 OTEL collector（遥测）
- opencode 版本检查端点：`api.github.com/repos/anomalyco/opencode`、npm registry 的 opencode 版本查询、`formulae.brew.sh`、`community.chocolatey.org`、ScoopInstaller raw 地址

> 边界说明：本约束指 mycode 运行时行为。开发仓库时的 `bun install`、构建、`git fetch` 不受此限制。
> 上游每次升级都可能引入新的回传路径（账号、OAuth、版本检查、遥测），**每次升级必须重跑「网络出口审计」**。

## 升级目标策略

- 目标基线：**最新 release tag**（如 `v1.18.21`），不再直接追 `upstream/dev` 裸顶端（dev 未经验证，且历史上 v1.18.0 这类"次版本"可能纯粹是桌面端迁移标记、Core 零改动）
- 主流程：**压缩 38 → 6 主题提交 → `git rebase --onto <tag>` → 双审计（保全 + 网络）→ 构建冒烟 → 收尾**

## 一次性配置（已完成）

```powershell
rtk git remote add upstream https://github.com/anomalyco/opencode.git
```

> 注意：upstream 只配置过、从未 fetch，本地没有任何 `upstream/*` 跟踪分支和 tag。第一次 `git fetch upstream --tags` 数据量较大。

## 升级流程

### Step 1：备份当前状态

```powershell
# 打标签作为回滚点（本地 + 远端双备份）
rtk git tag backup-$(Get-Date -Format "yyyyMMdd")
rtk git push origin backup-$(Get-Date -Format "yyyyMMdd")
```

### Step 2：拉取上游最新（含 tags）

```powershell
rtk git fetch upstream --tags

# 确定目标 tag
rtk git tag -l --sort=-v:refname "v*" | Select-Object -First 10
```

### Step 3：差距评估与网络面预判

```powershell
# 上游新 commits 数量
rtk git log --oneline 34e580905..<TAG> | Measure-Object -Line

# 高危文件冲突量预判（这些文件我们做过结构性删除/掏空）
rtk git diff --stat 34e580905..<TAG> -- `
  packages/opencode/src/config/config.ts `
  packages/opencode/src/cli/cmd/github.handler.ts `
  packages/opencode/src/cli/cmd/import.ts `
  packages/opencode/src/installation/index.ts `
  packages/opencode/src/account/account.ts `
  packages/tui/src/feature-plugins/sidebar/context.tsx

# 网络面预判：上游新增的 URL/域名（opencode 相关的新增项即"新增回传候选"）
rtk git diff 34e580905..<TAG> | Select-String -Pattern "^\+.*https?://" | ForEach-Object { $_.Line -replace '.*https?://','' -replace '/.*','' } | Sort-Object -Unique
```

### Step 4：压缩 38 → 6 个主题提交（零损失证明）

在独立分支上操作，`my-opencode-dec` 本步不动：

```powershell
rtk git checkout -b upgrade-rebase my-opencode-dec
rtk git reset --soft 34e580905
```

按主题分 6 次提交（跨主题的文件归入"最后涉及的主题"，如 `index.ts` 同时含 scriptName 改名/命令删除/chdir 块，归入主题 5）：

| # | 主题提交 | 包含内容 |
|---|---|---|
| 1 | `docs: privatization design, plans, update procedure, deployment guide` | `docs/superpowers/**`、`opencode私有化需求.md`、`.superpowers/**` |
| 2 | `refactor: rename opencode to mycode` | core 27 文件（12 个 provider 的 UA/Referer 等）、desktop/server/sdk-next/app、TUI 品牌全套（logo/wordmark/标题/横幅）、config 的 paths/managed/tui/tui-migrate、`script/build.ts`、CLI help、scriptName |
| 3 | `feat: disable cloud and telemetry for privatized build` | enterprise 整包删除、github.handler/github/import stub、account noop layer、upgrade no-op、installation、otlp、config.ts（$schema/account 块）、share-next、provider.ts（OpencodePlugin 移除）、app-runtime、被 stub 的测试、package.json、bun.lock |
| 4 | `feat(tui): cache hit rate sparkline in context sidebar` | `context.tsx` 全部自研功能 |
| 5 | `fix(mycode): wrapper, cwd preservation, build config` | `mycode.bat`、`index.ts`（chdir 块 + scriptName + 命令注册删除）、根 tsconfig、`.husky/pre-push`、`.gitignore`、`.codegraph` |

**零损失证明（必须通过才能进入下一步）**：

```powershell
# 压缩后分支与原分支内容必须完全一致
rtk git diff my-opencode-dec upgrade-rebase
# 预期：无输出。有输出则修到一致为止
rtk git log --oneline 34e580905..upgrade-rebase
# 预期：恰好 6 个提交
```

### Step 5：rebase 到目标 tag

```powershell
rtk git rebase --onto <TAG> 34e580905 upgrade-rebase
```

### Step 6：解决冲突（按主题策略）

> **重要：rebase 时 ours/theirs 语义与 merge 相反！**
> rebase 过程中 `HEAD`（ours）= 上游新基线，`theirs` = 正在被重放的你自己的提交。
> - 接受上游版本 = `git checkout --ours <file>`
> - 保留自己版本 = `git checkout --theirs <file>`
> （旧版文档此处写反了，已修正）

| 主题 | 冲突时的策略 |
|---|---|
| 1 docs | 预期零冲突（全部是新增文件），直接接受 |
| 2 改名 | `git checkout --ours <file>` 接受上游，记入清单，rebase 完统一重跑文本替换（见「重新应用文本替换」）；**上游新增的品牌/UA 字符串同样要替换** |
| 3 云摘除 | enterprise 目录 delete/modify 冲突 → 一律 `rtk git rm -r packages/enterprise` 重新删；stub 文件（github.handler/account/upgrade/otlp/share-next）保留我方实现；`config.ts` 保留删除块但合入上游其他改动；**上游若给 Account 接口新增方法，给 noopLayer 补 stub**（`login/poll` 用 `Effect.die`，其余返回空值，参考 account.ts 现有写法）；bun.lock 冲突 → `git checkout --ours bun.lock` 取上游版，最后 `bun install` 重新生成 |
| 4 sparkline | 保留我方 hunks；上游若重构了 context.tsx，手工把 cache hit rate / sparkColor 代码块重新嵌入新结构 |
| 5 wrapper/构建 | `tsconfig.json` 保留 `jsx` + `jsxImportSource` 两行并合入上游其余改动；`mycode.bat` 直接保留我方；其余小文件逐个合 |

```powershell
# 中途放弃 / 跳过
rtk git rebase --abort          # 完全回到 rebase 前
rtk git rebase --skip           # 跳过当前 commit（慎用，会丢该 commit 改动）
```

### Step 7：双审计（升级核心，不可跳过）

见下文「私有化保全审计」与「网络出口审计」两个章节，全部通过后才继续。

### Step 8：验证、推送、更新基点

```powershell
$env:PATH = "D:\npm-tools\bun;" + $env:PATH

# 1. 重新生成依赖（bun.lock 在 rebase 中取了上游版，enterprise 删除后需重算）
bun install --ignore-scripts

# 2. typecheck：先记录纯净 <TAG> 的预存错误数作为基线，只修"新增"错误
cd packages\opencode
bun typecheck

# 3. 构建
$env:OPENCODE_VERSION = "1.0.0"
bun run script/build.ts --single --skip-install
# 预期：Smoke test passed: 1.0.0

# 4. 运行验证
.\dist\opencode-windows-x64\bin\mycode.exe --version
.\dist\opencode-windows-x64\bin\mycode.exe --help | Select-String "mycode|opencode"
# 预期：全部显示 mycode，无 opencode 残留

# 5. 源码模式验证（wrapper 使用的模式，同时也是网络审计的运行时场景）
cd F:\Git\my-open-code\opencode
mycode run "hi"
# 预期：AI 正常响应；TUI 打开后侧栏 Context 面板显示 cache hit rate 彩色趋势条

# 6. 分支落地 + 推送
rtk git branch -f my-opencode-dec upgrade-rebase
rtk git checkout my-opencode-dec
rtk git push --force-with-lease origin my-opencode-dec

# 7. 更新本文档顶部「当前基点」
rtk git merge-base HEAD <TAG>
```

> `--force-with-lease` 比 `--force` 安全：如果远程有别人推送的新 commit 会拒绝。

## 私有化保全审计（marker 清单）

rebase 完成后逐条执行，全部 PASS 才算通过。行号以基线为准，匹配内容为准：

```powershell
# A. 云端摘除
if (Test-Path "packages\enterprise") { "FAIL: enterprise 目录存在" } else { "PASS: enterprise 已删除" }
(Get-Content "packages\opencode\src\cli\cmd\github.handler.ts").Count   # 预期 4（stub）
(Get-Content "packages\opencode\src\cli\cmd\github.ts").Count           # 预期 3（stub）
(Get-Content "packages\opencode\src\cli\cmd\import.ts").Count           # 预期 4（stub）
Select-String -Path "packages\opencode\src\account\account.ts" -Pattern "noopLayer"          # 预期有
Select-String -Path "packages\opencode\src\share\share-next.ts" -Pattern "const disabled = true"  # 预期有（基线第 23 行）
Select-String -Path "packages\core\src\plugin\provider.ts" -Pattern "OpencodePlugin"          # 预期无匹配
Select-String -Path "packages\opencode\src\index.ts" -Pattern "ConsoleCommand|GithubCommand|ImportCommand"  # 预期无匹配

# B. 遥测禁用
Select-String -Path "packages\opencode\src\cli\upgrade.ts" -Pattern "return"                  # no-op 函数
Select-String -Path "packages\core\src\observability\otlp.ts" -Pattern "return \[\]|Layer\.empty"  # 预期两处

# C. 改名
Select-String -Path "packages\core\src\global.ts" -Pattern 'const app = "mycode"'            # 基线第 10 行
Select-String -Path "packages\opencode\src\config\config.ts" -Pattern '"mycode\.jsonc", "mycode\.json"'
Select-String -Path "packages\opencode\src\index.ts" -Pattern '\.scriptName\("mycode"\)'
Select-String -Path "packages\opencode\src\temporary.ts" -Pattern '\.scriptName\("mycode"\)'
Select-String -Path "packages\core\src\database\database.ts" -Pattern "mycode"                # mycode.db
Select-String -Path "packages\opencode\src\config\managed.ts" -Pattern "mycode"               # /etc/mycode 等

# D. 自研功能
Select-String -Path "packages\tui\src\feature-plugins\sidebar\context.tsx" -Pattern "sparkColor"  # 基线第 7 行

# E. 构建/wrapper
Select-String -Path "tsconfig.json" -Pattern "jsxImportSource"
if (Test-Path "mycode.bat") { "PASS: mycode.bat 存在" } else { "FAIL: mycode.bat 丢失" }
Select-String -Path "mycode.bat" -Pattern "INIT_CWD|OMO_SEND_ANONYMOUS_TELEMETRY=0|OMO_DISABLE_POSTHOG=1"
```

**逐 hunk 对照法**（marker 之外的全量核对）：

```powershell
# 原始私有化 delta
rtk git diff 34e580905 my-opencode-dec > old-delta.patch
# 升级后分支相对纯上游的 delta
rtk git diff <TAG> upgrade-rebase > new-delta.patch
```

对照两个 delta，每处原始改动必须落入三类之一：

1. **已保留**——语义相同地存在于 new-delta
2. **已扩展**——改名/禁用逻辑额外覆盖了上游新增代码（如新 provider 文件的 UA 也要替换）
3. **自然作废**——上游删除了该区域（如上游删了某个我们改过的文件）

出现第四种（改动消失且非作废）= 静默丢失，立即补回。

## 网络出口审计（白名单制）

### A. 静态清点

```powershell
# 1. 全库提取 URL/host（tracked 文件）
rtk git grep -hoE "https?://[a-zA-Z0-9._-]+" -- "*.ts" "*.tsx" | Sort-Object -Unique

# 2. opencode 相关域 / 遥测 / 版本检查端点残留检查
rtk git grep -inE "opencode\.ai|opncd\.ai|sentry|posthog|brew\.sh|chocolatey|ScoopInstaller|api\.github\.com/repos/anomalyco" -- `
  "packages/core/src" "packages/opencode/src" "packages/tui/src"
```

规则：

- 第 1 步清单中每个 host 必须落入白名单（模型端点 / npmjs / github / 本地），落不进的逐个处置（stub/删除/短路）或列出请用户决策
- 第 2 步允许有匹配，但**每个匹配必须能指出"为什么运行时不可达"**——例如 `otlp.ts` 的 endpoint 解析代码仍在但被 no-op 旁路、`account.ts` 的 `clientId = "opencode-cli"` 在 noopLayer 后不再发出
- 专项复查 Step 3 产出的"上游新增域名清单"：每个 opencode 相关新增项确认无运行时可达路径

### B. 运行时抓包验证

```powershell
# 本地起抓包代理（mitmproxy 或 Fiddler），示例 mitmproxy：
mitmdump -w mycode-egress.log   # 默认 127.0.0.1:8080

# 另开终端，让 mycode 走代理
$env:HTTPS_PROXY = "http://127.0.0.1:8080"
$env:HTTP_PROXY  = "http://127.0.0.1:8080"

# 覆盖场景
mycode --version
mycode run "hi"                    # 完整会话（含工具调用，会走模型端点）
mycode                             # TUI 交互一次
# 插件冷加载场景（删缓存后启动会拉 npm/GitHub）：
rd /s /q "$env:USERPROFILE\.cache\mycode\packages\superpowers@git+https_"
mycode run "hi"
```

**断言**：

- 代理日志中 `opencode.ai` / `opncd.ai` / sentry / 版本检查端点连接数 = **0**
- 所有实际出口均落在白名单内（`open.bigmodel.cn`、`registry.npmjs.org`、`github.com`、本地）

> 注意：Bun 对 `HTTPS_PROXY` 的覆盖度可能不全。若代理日志明显偏少，改用 Fiddler 系统代理模式，或用 `netstat -ano | findstr <bun.exe的PID>` 辅助核对。也可用公司 EDR（联软）侧观测交叉确认。

## 重新应用文本替换（备查脚本）

如果 rebase 后需要重新执行 opencode → mycode 的文本替换，保存以下内容为 `F:\Git\my-open-code\opencode\rename.ps1` 并执行：

```powershell
# rename.ps1 - 重新执行 opencode → mycode 的用户可见文本替换
# 仅替换用户可见字符串，不触碰：
#   - @opencode-ai/* 包名
#   - OPENCODE_* 环境变量
#   - opencode-ai npm 包名
#   - 内部代码标识符（变量名、函数名、TypeId 等）

# 1. scriptName（CLI 入口，两个文件并存且都在用：
#    index.ts 是主 CLI 入口，temporary.ts 是 TUI worker 的独立 yargs 入口）
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
Get-ChildItem -Recurse "packages\opencode\src\cli\cmd" -Filter "*.ts" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $new = $content `
        -replace 'describe: "([^"]*?)opencode([^"]*?)"', 'describe: "$1mycode$2"' `
        -replace 'message: "([^"]*?)opencode([^"]*?)"', 'message: "$1mycode$2"'
    if ($content -ne $new) {
        Set-Content $_.FullName -Value $new -NoNewline
        Write-Output "Updated: $($_.FullName)"
    }
}

# 3. TUI logo（两个文件分工不同，均需检查）：
#    - packages/tui/src/component/logo.tsx：启动页文字 wordmark（"mycode" 粗体 + 副标题）
#    - packages/tui/src/logo.ts + util/presentation.ts：像素 MYCODE（会话结尾 epilogue 仍在用）
#    参考 commit efaedf09e（wordmark）和 bacc65ba3（像素版）

Write-Output "完成。请运行 typecheck 和 build 验证。"
```

> **此脚本的已知局限**（跑完后以 marker 清单为准，不要只信脚本）：
> - 不覆盖 `script/build.ts` 的 outfile/UA/`OPENCODE_CLI_NAME` define
> - 不覆盖 12 个 provider 文件的 User-Agent / HTTP-Referer / X-Title 头
> - 不覆盖 `global.ts`、`database.ts`、`managed.ts`、mDNS 等身份字符串
> - 上游新增文件中的品牌字符串（6 周内上游加了不少）需按 design spec §3.3 清单人工补
>
> 脚本误改内部标识符导致 typecheck 报错时，手动回滚即可。

## 已知遗留问题与处置建议

基线核实中发现的、文档此前未记载的遗留项，升级时顺手处理：

| # | 位置 | 问题 | 处置建议 |
|---|---|---|---|
| 1 | `packages/opencode/src/config/config.ts:398` | 项目级配置发现仍传 `"opencode"`（`ConfigPaths.files("opencode", ...)`） | 升级时确认语义后改为 `"mycode"`，并回归验证项目内 `.mycode/` 配置加载（2026-08-24 升级后仍在，待决策） |
| 2 | `packages/opencode/src/config/config.ts:180` | 悬空的 `const accountSvc = yield* Account.Service`（account 同步块删除后残留，无使用点） | rebase 后顺手删除，避免上游 Account 接口变化引发无谓类型错误（2026-08-24 升级后仍在，typecheck 无报错） |
| 3 | `packages/tui/src/util/presentation.ts:1-4` | 像素 MYCODE 的内联副本（与 `tui/src/logo.ts` 重复），session epilogue 用 | 保留（低风险）；上游重构 presentation 时记得同步像素画 |
| 4 | ~~`.husky/pre-push`~~ | ~~文件模式 100755 → 100644（丢失可执行位）~~ | ✅ 已在 2026-08-24 升级的压缩提交中自动恢复 755 |

## 关键文件清单（已核实）

以下是 mycode 自定义改动涉及的核心文件。注意几组**并存且各有分工**的文件，别当成二选一：

```
# 构建与启动
mycode.bat                                        # wrapper：OPENCODE_VERSION/INIT_CWD/OMO_* 环境变量
                                                  #   + pushd packages\opencode + bun.exe src\index.ts
bun.exe                                           # 仓库根目录，gitignored（EDR 白名单依赖此进程名）
tsconfig.json                                     # jsx: react-jsx + jsxImportSource: @opentui/solid
packages/opencode/script/build.ts                 # outfile bin/mycode、UA mycode/、OPENCODE_CLI_NAME define

# 核心私有化
packages/core/src/global.ts                       # XDG root: app="mycode"（单点级联全部目录）
packages/core/src/observability/otlp.ts           # loggers()→[]、tracingLayer()→Layer.empty
packages/opencode/src/cli/upgrade.ts              # upgrade() no-op 函数（TUI worker 的 checkUpgrade 调用）
packages/opencode/src/cli/cmd/upgrade.ts          # CLI 命令版：打印 "Upgrade is disabled in this build"
packages/opencode/src/account/account.ts          # noopLayer（前 187 行实现保留但被旁路）
packages/opencode/src/share/share-next.ts         # const disabled = true 硬编码 + 6 处守卫
packages/opencode/src/config/config.ts            # mycode.json 候选、$schema 置空、account 同步块已删

# 云端 stub（4/3/4 行的 export {}）
packages/opencode/src/cli/cmd/github.handler.ts
packages/opencode/src/cli/cmd/github.ts
packages/opencode/src/cli/cmd/import.ts
packages/core/src/plugin/provider.ts              # OpencodePlugin 注册已删，仅剩 30+ 第三方 provider

# CLI 入口（两个并存）
packages/opencode/src/index.ts                    # 主入口：scriptName("mycode") + INIT_CWD chdir 块
                                                  #   + Console/Github/Import 命令注册已删
packages/opencode/src/temporary.ts                # TUI worker 入口：scriptName("mycode")
packages/opencode/src/cli/cmd/*.ts                # 帮助文本改名（散落多处）

# TUI（logo 两个文件并存）
packages/tui/src/component/logo.tsx               # 启动页文字 wordmark（home.tsx splash）
packages/tui/src/logo.ts                          # 像素 MYCODE（go 被 bg-pulse-render 用）
packages/tui/src/util/presentation.ts             # 像素副本（session epilogue）
packages/tui/src/feature-plugins/sidebar/context.tsx  # ★ 自研：cache hit rate + 彩色 sparkline

# 文档
docs/superpowers/specs/2026-07-12-opencode-privatization-design.md   # 设计 spec（改动总清单）
docs/superpowers/plans/2026-07-12-opencode-privatization.md          # 实施计划（历史执行记录）
docs/superpowers/update-procedure.md                                 # 本文档
docs/superpowers/deployment-guide.md                                 # 部署指南
```

> enterprise 移除方式：直接删目录即可。根 package.json 的 workspaces 用 `packages/*` 通配，从未显式引用 `packages/enterprise`，无需改 package.json。

## 回滚

```powershell
# 回滚到升级前的标签
rtk git reset --hard backup-<日期>
rtk git push --force-with-lease origin my-opencode-dec
```

## 运行环境依赖

| 工具 | 路径 | 用途 |
|---|---|---|
| Bun | `D:\npm-tools\bun` | 运行源码模式 + 构建 |
| Git | 系统 PATH | 版本管理 |
| RTK | `D:\rtk` | Git 输出压缩（可选） |

mycode wrapper（`mycode.bat`）已硬编码仓库内 `bun.exe` 路径。Bun 迁移位置需同步更新 `mycode.bat`。

---

## 插件升级

mycode 使用的两个插件（superpowers、oh-my-openagent）独立于 opencode 上游升级，有各自的升级方式。插件源（npm registry、GitHub）属于网络白名单允许项。

### 方式一：oh-my-openagent 自动升级（默认）

oh-my-openagent 自带 `auto-update-checker`，默认 `auto_update: true`。每次启动 mycode 时会自动检查 npm registry 并升级缓存。**正常使用不需要手动操作。**

配置文件位置：`~/.config/mycode/oh-my-openagent.json`

```jsonc
{
  // 设置为 false 可禁用自动升级（仅通知）
  "auto_update": true,
  // 其他配置...
}
```

> oh-my-openagent 自身的遥测已被 wrapper 禁用：`mycode.bat` 设置 `OMO_SEND_ANONYMOUS_TELEMETRY=0`、`OMO_DISABLE_POSTHOG=1`。

### 方式二：superpowers 手动升级

superpowers 是 git 仓库（`obra/superpowers`），mycode 启动时发现缓存目录已存在就跳过下载。**必须手动删除缓存**才能重新拉取最新版。

```bat
rd /s /q "%USERPROFILE%\.cache\mycode\packages\superpowers@git+https_"
mycode run "hi"
```

### 方式三：一键强制升级两个插件

```bat
rd /s /q "%USERPROFILE%\.cache\mycode\packages\oh-my-openagent@latest"
rd /s /q "%USERPROFILE%\.cache\mycode\packages\superpowers@git+https_"
mycode run "hi"
```

### 验证插件版本

```powershell
Get-Content "$env:USERPROFILE\.cache\mycode\packages\oh-my-openagent@latest\node_modules\oh-my-openagent\package.json" | ConvertFrom-Json | Select name, version
Get-Content "$env:USERPROFILE\.cache\mycode\packages\superpowers@git+https_\github.com\obra\superpowers.git\node_modules\superpowers\package.json" | ConvertFrom-Json | Select name, version
```

### 插件配置文件

| 文件 | 位置 | 作用 |
|---|---|---|
| mycode.jsonc | `~/.config/mycode/mycode.jsonc` | 主配置（provider、mcp、plugin 列表） |
| oh-my-openagent.json | `~/.config/mycode/oh-my-openagent.json` | oh-my-openagent 配置（agents、categories、auto_update） |
| auth.json | `~/.local/share/mycode/auth.json` | API 凭证 |
| tui.json | `~/.config/mycode/tui.json` | TUI 配置 |

---

## Bun 版本同步

如果 Bun runtime 升级了（`D:\npm-tools\bun` 更新），需要同步项目内的 `bun.exe` 副本：

```powershell
& "D:\npm-tools\bun\node_modules\bun\bin\bun.exe" --version

Copy-Item "D:\npm-tools\bun\node_modules\bun\bin\bun.exe" "F:\Git\my-open-code\opencode\bun.exe" -Force

$src = (Get-FileHash "D:\npm-tools\bun\node_modules\bun\bin\bun.exe" -Algorithm SHA256).Hash
$dst = (Get-FileHash "F:\Git\my-open-code\opencode\bun.exe" -Algorithm SHA256).Hash
Write-Output "一致: $($src -eq $dst)"
```

> **注意**：EDR 基于**进程名 `bun.exe`** 判断是否为已知安全应用。Bun 升级但进程名仍为 `bun.exe` 时 EDR 仍然容忍；若 Bun 改名（如 `bun-runtime.exe`）需重新评估 EDR 兼容性。**切勿**让 `mycode.bat` 调用其他名字的 exe。

---

## 完整升级检查清单

```
□  1. 备份：git tag backup-<日期> 并 push 到 origin
□  2. 拉取：git fetch upstream --tags
□  3. 确定目标 release tag，跑差距评估 + 上游新增域名清单
□  4. 压缩 38 → 6 主题提交，零损失证明（git diff my-opencode-dec 为空）
□  5. rebase --onto <TAG> 34e580905
□  6. 冲突解决（注意 ours=上游 / theirs=自己）
□  7. bun install --ignore-scripts（重生成 bun.lock）
□  8. 检查 Bun 版本是否需要同步（见上节）
□  9. Typecheck：对比纯净 <TAG> 预存错误基线，新增错误清零
□ 10. 私有化保全审计：marker 清单全 PASS + 逐 hunk 对照无静默丢失
□ 11. 网络出口审计：静态白名单清点 + 抓包断言 opencode 相关连接 = 0
□ 12. 构建 + 冒烟：mycode.exe --version/--help 无残留、run "hi" 走通、sparkline 正常
□ 13. 分支落地：git branch -f my-opencode-dec + force-with-lease 推送
□ 14. 更新本文档基点与提交数记录
```

## 文档索引

- `docs/superpowers/specs/2026-07-12-opencode-privatization-design.md` —— 私有化设计 spec（改动总清单、rebase 策略、验收标准）
- `docs/superpowers/plans/2026-07-12-opencode-privatization.md` —— 实施计划（19 个 Task 的历史执行记录，含 Account noop layer 完整代码）
- `docs/superpowers/deployment-guide.md` —— 新机器部署指南（其"同步上游 opencode"一节以本文档主流程为准）
- `opencode私有化需求.md` —— 原始需求（EDR 约束、可跟随升级）

---

## 升级记录：2026-08-24 v1.17.18 → v1.18.21

首次按本文档流程执行的完整升级，全部检查项通过。

**执行摘要**：

| 项 | 结果 |
|---|---|
| 目标 | `v1.18.21`（`826d9ad46a`），上游 603 个新提交 |
| 冲突面 | 27 个双方修改文件 + 2 个 delete/modify（enterprise），全部按主题策略解决 |
| 历史压缩 | 39 个原始提交 → 5 个主题提交 + 1 个 models.dev 专项提交 |
| 零损失证明 | 压缩后 `git diff backup-20260824` 仅差 pre-push 执行位（属修复），内容零差异 |
| 保全审计 | marker 清单全 PASS；155 个改动文件 154 个进入新 delta，唯一例外 bun.lock（按策略重生成） |
| typecheck | `packages/opencode` **0 错误**（优于旧基线的 6 个预存错误） |
| 构建 | Smoke test passed: 1.0.0，产物 `dist/opencode-windows-x64/bin/mycode.exe`（178MB） |
| 冒烟 | `--version` 1.0.0；`--help` 零 opencode 残留；wrapper 真实调用 GLM 正常响应 |
| 网络验证 | 运行时 netstat 快照：外连仅 bigmodel 模型端点（IPv6 与 `open.bigmodel.cn` 解析吻合）+ localhost MCP，白名单外出口为 0 |

**本次升级的关键处理**：

1. **models 目录源**：上游把默认源从 `https://models.dev` 改为 `https://models.opencode.ai`（opencode 官方域）。已恢复为 `models.dev`（专项提交），保持既有行为、不引入官方交互。
2. **console URL 变更**：上游 v1.18.19 把 account 连接的默认 Console URL 改为 `https://opencode.ai/console`（commit `2cba7e227d`）。我方 `provider/opencode.ts` 的 `defaultServer = ""` 在冲突中保留，且该 provider 未注册，双保险。
3. **Account 接口**：上游给 `Account.remove` 增加了"删除后切换到下一个 org"逻辑。我方 noopLayer 不受影响（`remove` 仍是 `Effect.void`），冲突中保留我方实现。
4. **models.dev 在本网络不可达**（直连与代理均拒）：构建时用 `~/.cache/mycode/models.json`（运行时缓存快照，Jul 22 版）起本地 HTTP 服务，通过 `OPENCODE_MODELS_URL=http://127.0.0.1:18923` 喂给 `script/generate.ts`。注意 `MODELS_DEV_API_JSON` 环境变量因 Windows 32KB 上限放不下 3.2MB 的 JSON，不可用。运行时对 models.dev 不可达本身有回退（落缓存文件），无需处理。
5. **enterprise**：上游 6 周仅改了 2 个文件，`git rm` 重删即完成，根 package.json 无需改动。

**运行时网络静态审计结论**（v1.18.21 基础上）：

- 活代码路径对 opencode 官方设施连接数为 0（provider 未注册 + server 置空、account/share/upgrade/otlp 全 no-op、models 源为第三方 models.dev）
- `mycode.ai` 域名 8 处为改名产物（HTTP-Referer 头等，指向不存在的域，安全）
- 预存非 opencode 出网点（非本次升级引入，维持原状）：
  - LSP 二进制从 `api.github.com` 的第三方 releases 下载（zls/clangd 等，`"lsp": true` 配置驱动）
  - prompt 文本（`session/prompt/*.txt` 3 处）指示 AI 在用户问及 opencode 功能时 WebFetch `opencode.ai/docs`——属 AI 指令字符串，触发条件罕见；如需彻底清零可改为本地文档指引

**回滚点**：`backup-20260824` tag（已推送 origin）= 升级前的 39 提交原始状态；原始提交历史（含 bacc65ba3 等 rename.ps1 参考的 commit hash）保存在该 tag 中。
