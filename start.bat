@echo off
rem Switch console to UTF-8 so artex's own console output, which may contain
rem non-ASCII text, displays correctly. NOTE: this .bat file itself must stay
rem pure ASCII - Windows cmd.exe's batch parser does not reliably handle
rem non-ASCII bytes in comments or commands even with chcp 65001, since it
rem can corrupt line parsing in hard-to-predict ways. Keep any translated
rem prose in README.md or start.sh instead.
chcp 65001 >nul 2>&1
rem ARTEX startup supervisor script for Windows.
rem
rem Usage:
rem   start.bat                  run in foreground, Ctrl-C to stop
rem   start.bat -addr :9000      extra arguments are passed through to artex unchanged
rem
rem It does one thing: runs artex.exe, and after the process exits, decides
rem whether to restart it based on the exit code.
rem
rem   0      user stopped normally       - exit the loop
rem   75     program requested a restart - restart immediately, the user
rem          clicked update or rollback on the page
rem   other  crash                       - restart with backoff, 1 2 4 and so on up to 60 seconds
rem
rem Downloading, SHA256 verification and swapping the binary are not done
rem here, artex itself does all of that at startup in the selfupdate package.
rem This script stays as simple as possible, see the note at the top of
rem start.sh for details.
rem
rem Deliberately avoids if-block syntax that needs matching parentheses:
rem cmd.exe's parser reads a whole parenthesized block ahead, including any
rem rem lines inside it, to find the matching close paren, and that lookahead
rem is known to misfire in combination with delayed expansion and escaped
rem parentheses. Plain goto and label control flow below sidesteps that
rem failure mode entirely.

setlocal
cd /d "%~dp0"

set BIN=artex.exe
if not exist "%BIN%" goto nobin

set RESTART_CODE=75
set MAX_DELAY=60
set delay=1

:loop
"%BIN%" %*
set code=%ERRORLEVEL%

if "%code%"=="0" goto normal
if "%code%"=="%RESTART_CODE%" goto restart

echo [artex] crashed, exit code %code%, retrying in %delay%s 1>&2
set /a pings=%delay%+1
ping -n %pings% 127.0.0.1 >nul 2>&1
set /a delay=%delay%*2
if %delay% gtr %MAX_DELAY% set delay=%MAX_DELAY%
goto loop

:restart
echo [artex] restart requested, applying new version
set delay=1
goto loop

:normal
echo [artex] exited normally
exit /b 0

:nobin
echo [artex] executable not found: %BIN% 1>&2
exit /b 1
