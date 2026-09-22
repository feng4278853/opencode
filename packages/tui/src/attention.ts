/// <reference path="./audio.d.ts" />
import type {
  Attention,
  AttentionNotifyOptions,
  AttentionNotifyResult,
  AttentionNotifySkipReason,
  AttentionWhen,
  AttentionSoundName,
} from "@opencode/plugin/tui/context"
import { Config } from "./config"
import { Schema } from "effect"
import stripAnsi from "strip-ansi"
import * as TuiAudio from "./audio"
import {
  defaultSoundPath,
  questionSoundPath,
  permissionSoundPath,
  errorSoundPath,
  subagentDoneSoundPath,
} from "#attention-sounds"

type FocusState = "unknown" | "focused" | "blurred"

type AttentionRenderer = {
  readonly isDestroyed: boolean
  on(event: "focus" | "blur", listener: () => void): unknown
  off(event: "focus" | "blur", listener: () => void): unknown
  triggerNotification(message: string, title?: string): boolean
}

type AttentionHost = Attention & {
  dispose(): void
}

const DEFAULT_TITLE = "mycode"
const TITLE_LIMIT = 80
const MESSAGE_LIMIT = 240
const BUILTIN_SOUNDS: Record<AttentionSoundName, string> = {
  default: defaultSoundPath,
  question: questionSoundPath,
  permission: permissionSoundPath,
  error: errorSoundPath,
  done: defaultSoundPath,
  subagent_done: subagentDoneSoundPath,
}

function skipped(reason: AttentionNotifySkipReason): AttentionNotifyResult {
  return {
    ok: false,
    notification: false,
    sound: false,
    skipped: reason,
  }
}

function normalizeText(input: string | undefined, fallback: string, limit: number) {
  const text = stripAnsi(input ?? "")
    .replace(/[ \t]*[\r\n]+[ \t]*/g, " ")
    .replace(/[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim()
  const normalized = text.length ? text : fallback
  return Array.from(normalized).slice(0, limit).join("")
}

function clampVolume(volume: number) {
  if (!Number.isFinite(volume)) return 0
  return Math.min(1, Math.max(0, volume))
}

function soundVolume(input: AttentionNotifyOptions, config: Pick<Config.Resolved, "attention">) {
  if (!config.attention.sound) return
  if (input.sound === false) return
  if (input.sound === undefined) return clampVolume(config.attention.volume)
  if (input.sound === true) return clampVolume(config.attention.volume)
  return clampVolume(input.sound.volume ?? config.attention.volume)
}

function focusSkip(when: AttentionWhen, focus: FocusState) {
  if (when === "always") return
  if (focus === "unknown") return "focus_unknown"
  if (when === "blurred" && focus === "focused") return "focused"
  if (when === "focused" && focus === "blurred") return "blurred"
}

// Windows Terminal does not support the OSC notification protocol the renderer
// uses, so we surface attention messages as native Windows toasts via
// PowerShell WinRT. Title/body travel through env vars to sidestep
// command-line encoding and quoting issues with non-ASCII text.
// The mint-green "M" badge is generated once with System.Drawing and cached in
// the mycode cache dir; toasts render silent because the attention sound pack
// owns audio. Clicking a toast activates the mycode:// protocol, which
// lazily registers itself and focuses the terminal window; the toast is
// suppressed entirely when mycode already owns the foreground window.
function windowsToast(title: string, message: string) {
  const ps = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Fg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$fgText = New-Object System.Text.StringBuilder 256
[Win32Fg]::GetWindowText([Win32Fg]::GetForegroundWindow(), $fgText, 256) | Out-Null
if ($fgText.ToString() -like 'mycode*') { exit 0 }
$ndir = Join-Path $env:USERPROFILE '.cache\\mycode\\notify'
New-Item -ItemType Directory -Path $ndir -Force | Out-Null
$icon = Join-Path $ndir 'mycode-toast-icon.png'
if (-not (Test-Path $icon)) {
  try {
    Add-Type -AssemblyName System.Drawing
    $size = 96
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)
    $rect = New-Object System.Drawing.Rectangle(4, 4, ($size - 8), ($size - 8))
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 126, 213, 192), [System.Drawing.Color]::FromArgb(255, 84, 170, 154), 45)
    $g.FillEllipse($brush, $rect)
    $font = New-Object System.Drawing.Font('Segoe UI', 42, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 'Center'
    $fmt.LineAlignment = 'Center'
    $g.DrawString('M', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 0, $size, $size)), $fmt)
    $g.Dispose()
    $bmp.Save($icon, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } catch { $icon = $null }
}
$vbs = Join-Path $ndir 'mycode-focus.vbs'
if (-not (Test-Path $vbs)) {
  Set-Content -Path $vbs -Encoding ASCII -Value @'
Dim sh, ps
Set sh = CreateObject("WScript.Shell")
ps = sh.ExpandEnvironmentStrings("%USERPROFILE%\\.cache\\mycode\\notify\\mycode-focus.ps1")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ps & """", 0, False
'@
}
$focus = Join-Path $ndir 'mycode-focus.ps1'
if (-not (Test-Path $focus)) {
  Set-Content -Path $focus -Encoding ASCII -Value @'
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Focus {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool attach);
}
"@
$all = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }
$target = $all | Where-Object { $_.MainWindowTitle -like 'mycode*' } | Select-Object -First 1
if (-not $target) {
  $target = $all | Where-Object { $_.ProcessName -eq 'bun' } | Select-Object -First 1
}
if (-not $target) {
  $target = $all | Where-Object { $_.ProcessName -eq 'WindowsTerminal' } | Select-Object -First 1
}
if (-not $target) { exit 0 }
$h = [IntPtr]$target.MainWindowHandle
$fgPid = [uint32]0
$fgThread = [Win32Focus]::GetWindowThreadProcessId([Win32Focus]::GetForegroundWindow(), [ref]$fgPid)
$myThread = [Win32Focus]::GetCurrentThreadId()
[Win32Focus]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null
[Win32Focus]::ShowWindow($h, 9) | Out-Null
[Win32Focus]::SetForegroundWindow($h) | Out-Null
[Win32Focus]::AttachThreadInput($myThread, $fgThread, $false) | Out-Null
'@
}
$regKey = 'HKCU:\\Software\\Classes\\mycode'
$cmdKey = "$regKey\\shell\\open\\command"
$want = 'wscript.exe "' + $vbs + '"'
if (-not (Test-Path $cmdKey) -or (Get-Item $cmdKey).GetValue('') -ne $want) {
  New-Item -Path $regKey -Force | Out-Null
  Set-Item -Path $regKey -Value 'URL:mycode'
  Set-ItemProperty -Path $regKey -Name 'URL Protocol' -Value ''
  New-Item -Path $cmdKey -Force | Out-Null
  Set-Item -Path $cmdKey -Value $want
}
function Esc([string]$s) { $s.Replace('&', '&amp;').Replace('<', '&lt;').Replace('>', '&gt;') }
$imageNode = ''
if ($icon -and (Test-Path $icon)) { $imageNode = '<image placement="appLogoOverride" hint-crop="circle" src="' + ([Uri]$icon).AbsoluteUri + '"/>' }
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml('<toast activationType="protocol" launch="mycode:focus" duration="long"><visual><binding template="ToastGeneric">' + $imageNode + '<text>' + (Esc $env:MC_TOAST_TITLE) + '</text><text>' + (Esc $env:MC_TOAST_MSG) + '</text><text placement="attribution">mycode</text></binding></visual><audio silent="true"/></toast>')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($xml))
`
  const encoded = Buffer.from(ps, "utf16le").toString("base64")
  Bun.spawn(["powershell.exe", "-NoProfile", "-EncodedCommand", encoded], {
    env: { ...process.env, MC_TOAST_TITLE: title, MC_TOAST_MSG: message },
    stdout: "ignore",
    stderr: "ignore",
    windowsHide: true,
  })
}

export function createTuiAttention(input: {
  renderer: AttentionRenderer
  config: Pick<Config.Resolved, "attention">
  audio?: Pick<typeof TuiAudio, "loadSoundFile" | "play">
}): AttentionHost {
  let focus: FocusState = "unknown"
  let disposed = false
  const audio = input.audio ?? TuiAudio

  const onFocus = () => {
    focus = "focused"
  }
  const onBlur = () => {
    focus = "blurred"
  }

  input.renderer.on("focus", onFocus)
  input.renderer.on("blur", onBlur)

  function soundCandidates(name: AttentionSoundName) {
    return [input.config.attention.sounds[name], BUILTIN_SOUNDS[name]].filter(
      (item, index, list): item is string => typeof item === "string" && list.indexOf(item) === index,
    )
  }

  async function playSound(name: AttentionSoundName, volume: number) {
    try {
      for (const file of soundCandidates(name)) {
        const current = await audio.loadSoundFile(file).catch((error) => {
          console.debug("failed to load attention sound", { file, error })
          return null
        })
        if (disposed) return false
        if (current == null) continue
        if (audio.play(current, { volume }) != null) return true
      }
      return false
    } catch (error) {
      console.debug("failed to play attention sound", { error })
      return false
    }
  }

  return {
    async notify(request) {
      try {
        if (!input.config.attention.notifications && !input.config.attention.sound) return skipped("attention_disabled")
        if (disposed || input.renderer.isDestroyed) return skipped("renderer_destroyed")

        const message = normalizeText(request.message, "", MESSAGE_LIMIT)
        if (!message) return skipped("empty_message")

        const requestedNotification = typeof request.notification === "object" ? request.notification : undefined
        const notificationSkip = focusSkip(requestedNotification?.when ?? "blurred", focus)
        const notificationRequested = input.config.attention.notifications && request.notification !== false
        const shouldNotify = notificationRequested && !notificationSkip
        const notification = shouldNotify
          ? (() => {
              try {
                const title = normalizeText(request.title, DEFAULT_TITLE, TITLE_LIMIT)
                const win32 = process.platform === "win32"
                if (win32) void windowsToast(title, message)
                return input.renderer.triggerNotification(message, title) || win32
              } catch (error) {
                console.debug("failed to trigger attention notification", { error })
                return false
              }
            })()
          : false
        const volume = soundVolume(request, input.config)
        const requestedSound = typeof request.sound === "object" ? request.sound : undefined
        const soundSkip = volume === undefined ? undefined : focusSkip(requestedSound?.when ?? "always", focus)
        const soundName =
          requestedSound?.name && Schema.is(Config.AttentionSoundName)(requestedSound.name)
            ? requestedSound.name
            : "default"
        const sound = volume === undefined || soundSkip ? false : await playSound(soundName, volume)

        if (!notification && !sound) {
          if (notificationRequested && notificationSkip) return skipped(notificationSkip)
          if (soundSkip) return skipped(soundSkip)
        }

        return {
          ok: notification || sound,
          notification,
          sound,
        }
      } catch (error) {
        console.debug("failed to handle attention notification", { error })
        return {
          ok: false,
          notification: false,
          sound: false,
        }
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      input.renderer.off("focus", onFocus)
      input.renderer.off("blur", onBlur)
    },
  }
}
