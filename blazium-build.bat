@echo off
rem Builds the standalone GitHub Desktop Blazium (no webpack server, no bat to open it)
rem into dist\GitHubDesktopBlazium-win32-x64, then opens it. Its first launch adds it to
rem the Start menu; pin it to the taskbar from there.
cd /d "%~dp0"
set "EXE=dist\GitHubDesktopBlazium-win32-x64\GitHubDesktopBlazium.exe"

rem Its files can't be replaced while it runs, and it must close by itself (a forced
rem kill can lose login/preferences).
tasklist /fi "imagename eq GitHubDesktopBlazium.exe" | find /i "GitHubDesktopBlazium.exe" >nul
if not errorlevel 1 (
  echo Close GitHub Desktop Blazium first, then run this again.
  pause
  exit /b 1
)

call node vendor\yarn-1.21.1.js build:prod
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  pause
  exit /b 1
)
start "" "%EXE%"
