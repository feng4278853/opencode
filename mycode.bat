@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "PATH=D:\npm-tools\bun;%PATH%"
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%packages\opencode"
rem Disable oh-my-openagent anonymous telemetry (PostHog) by default
rem Users can override by setting OMO_SEND_ANONYMOUS_TELEMETRY=yes in their environment
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
bun run "src\index.ts" %*
