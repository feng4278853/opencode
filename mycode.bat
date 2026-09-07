@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "SCRIPT_DIR=%~dp0"
rem Save caller's directory before pushd so mycode can show it in TUI
set "INIT_CWD=%CD%"
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
set "OPENCODE_DISABLE_MODELS_FETCH=1"
set "RETRY=0"
pushd "%SCRIPT_DIR%packages\opencode"
:run
rem Capture stderr so Bun crash stacks land in a file instead of vanishing with the console
"%SCRIPT_DIR%bun.exe" "src\index.ts" %* 2>>"%USERPROFILE%\.cache\mycode\stderr.log"
set "EC=%ERRORLEVEL%"
rem The EDR network hook races with bun startup and occasionally segfaults (0xC0000005 = -1073741819); a retry boots fine
if %EC%==-1073741819 goto segv
if %EC%==3221225477 goto segv
goto done
:segv
if %RETRY% GEQ 2 goto done
set /a RETRY+=1
timeout /t 1 /nobreak >nul
goto run
:done
popd
exit /b %EC%
