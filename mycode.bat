@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%packages\opencode"
rem Disable oh-my-openagent anonymous telemetry (PostHog) by default
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
"%SCRIPT_DIR%bun.exe" "src\index.ts" %*
