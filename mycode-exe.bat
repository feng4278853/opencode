@echo off
setlocal
set "OPENCODE_VERSION=1.0.0"
set "SCRIPT_DIR=%~dp0"
rem Save caller's directory so mycode can show it in TUI (same as source-mode wrapper)
set "INIT_CWD=%CD%"
set "OMO_SEND_ANONYMOUS_TELEMETRY=0"
set "OMO_DISABLE_POSTHOG=1"
rem The compiled binary runs without this wrapper by default; keep models catalog local-only
set "OPENCODE_DISABLE_MODELS_FETCH=1"
set "RETRY=0"
set "EXE=%SCRIPT_DIR%packages\opencode\dist\opencode-windows-x64\bin\mycode.exe"
if not exist "%EXE%" (
    echo mycode.exe not found: %EXE%
    echo Build it first: cd packages\opencode ^&^& OPENCODE_VERSION=1.0.0 bun run script/build.ts --single --skip-install
    exit /b 1
)
:run
rem Capture stderr so Bun crash stacks land in a file instead of vanishing with the console
"%EXE%" %* 2>>"%USERPROFILE%\.cache\mycode\stderr.log"
set "EC=%ERRORLEVEL%"
rem The EDR network hook races with bun startup inside the binary too (0xC0000005); retrying boots fine
if %EC%==-1073741819 goto segv
if %EC%==3221225477 goto segv
goto done
:segv
if %RETRY% GEQ 2 goto done
set /a RETRY+=1
timeout /t 1 /nobreak >nul
goto run
:done
exit /b %EC%
