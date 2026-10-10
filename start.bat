@echo off
rem Switch console to UTF-8 so artex's own console output (which may contain
rem non-ASCII text) displays correctly. NOTE: this .bat file itself must stay
rem pure ASCII - Windows cmd.exe's batch parser does not reliably handle
rem non-ASCII bytes in comments/commands even with chcp 65001 (it can corrupt
rem line parsing in hard-to-predict ways). Keep any translated prose in
rem README.md / start.sh instead.
chcp 65001 >nul 2>&1
rem ARTEX startup supervisor script (Windows)
rem
rem Usage:
rem   start.bat                  run in foreground (Ctrl-C to stop)
rem   start.bat -addr :9000      extra arguments are passed through to artex unchanged
rem
rem It does one thing: runs artex.exe, and after the process exits, decides
rem whether to restart it based on the exit code.
rem
rem   0      user stopped normally       -> exit the loop
rem   75     program requested a restart -> restart immediately (user clicked
rem          "update" or "rollback" on the page)
rem   other  crash                       -> restart with backoff (1->2->4... up to 60 seconds)
rem
rem Downloading, SHA256 verification and swapping the binary are not done
rem here - artex itself does all of that at startup (the selfupdate package).
rem This script stays as simple as possible, see the note at the top of
rem start.sh for details.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "BIN=artex.exe"
if not exist "%BIN%" (
	echo [artex] executable not found: %BIN% 1>&2
	exit /b 1
)

set "RESTART_CODE=75"
set "MAX_DELAY=60"
set /a delay=1

:loop
"%BIN%" %*
set "code=!ERRORLEVEL!"

if "!code!"=="0" (
	echo [artex] exited normally
	exit /b 0
)

if "!code!"=="%RESTART_CODE%" (
	rem Update/rollback is ready: after restarting, artex itself finishes swapping the binary at startup.
	echo [artex] restart requested (applying new version)...
	set /a delay=1
	goto loop
)

echo [artex] crashed ^(code=!code!^), restarting in !delay!s 1>&2
rem timeout fails in a redirected console, so use ping as a fallback (an N-second delay needs N+1 pings).
set /a pings=!delay!+1
ping -n !pings! 127.0.0.1 >nul 2>&1
set /a delay=!delay!*2
if !delay! gtr %MAX_DELAY% set /a delay=%MAX_DELAY%
goto loop
