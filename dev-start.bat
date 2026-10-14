@echo off
rem Opens the fork's dev build the right way: the exe needs the webpack server on port 3100.
rem Does a full build:dev first only when dependencies, app/static or build config changed.
cd /d "%~dp0"
set "EXE=dist\GitHubDesktop-dev-win32-x64\GitHubDesktop-dev.exe"

netstat -ano | findstr /r /c:":3100 .*LISTENING" >nul
if %errorlevel%==0 (
  set NODE_ENV=development
  start "" "%EXE%"
  exit /b 0
)

node script\dev-build-stamp.mjs check
if errorlevel 1 (
  echo Dependencies, app/static or build config changed: full build first...
  call node vendor\yarn-1.21.1.js build:dev || (pause & exit /b 1)
  node script\dev-build-stamp.mjs write
)

rem Server closes by itself when the app window is closed.
start "GitHub Desktop dev server" /min cmd /c "node vendor\yarn-1.21.1.js start || pause"
