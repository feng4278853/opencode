@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "SCRIPT_DIR=%~dp0"
rem Save caller's directory before pushd so mycode can show it in TUI
set "INIT_CWD=%CD%"
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
pushd "%SCRIPT_DIR%packages\opencode"
"%SCRIPT_DIR%bun.exe" "src\index.ts" %*
set "EC=%ERRORLEVEL%"
popd
exit /b %EC%