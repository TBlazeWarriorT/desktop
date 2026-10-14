@echo off
rem Opens the fork's dev build the right way: the exe needs the webpack server on port 3100.
cd /d "%~dp0"
set "EXE=dist\GitHubDesktop-dev-win32-x64\GitHubDesktop-dev.exe"

if not exist "%EXE%" (
  echo No dev build yet, building first...
  call node vendor\yarn-1.21.1.js build:dev || (pause & exit /b 1)
)

netstat -ano | findstr /r /c:":3100 .*LISTENING" >nul
if %errorlevel%==0 (
  set NODE_ENV=development
  start "" "%EXE%"
  exit /b 0
)

rem Server closes by itself when the app window is closed.
start "GitHub Desktop dev server" /min cmd /c "node vendor\yarn-1.21.1.js start || pause"
