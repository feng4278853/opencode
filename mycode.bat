@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "SCRIPT_DIR=%~dp0"
set "CALLER_CWD=%CD%"
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
"%SCRIPT_DIR%bun.exe" --cwd "%CALLER_CWD%" "%SCRIPT_DIR%packages\opencode\src\index.ts" %*