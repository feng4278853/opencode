@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "PATH=D:\npm-tools\bun;%PATH%"
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%packages\opencode"
bun run "src\index.ts" %*
