@echo off
rem Full dev rebuild, then reopens the app. Only needed after yarn install, app/static or webpack config changes:
rem dev-start.bat already watches and recompiles all code.
cd /d "%~dp0"
rem Close gracefully first: a forced kill can lose unsaved login/preferences.
taskkill /im GitHubDesktop-dev.exe >nul 2>&1
for /l %%i in (1,1,15) do (
  tasklist /fi "imagename eq GitHubDesktop-dev.exe" | find /i "GitHubDesktop-dev.exe" >nul || goto closed
  timeout /t 1 /nobreak >nul
)
taskkill /im GitHubDesktop-dev.exe /f >nul 2>&1
:closed
call node vendor\yarn-1.21.1.js build:dev
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  pause
  exit /b 1
)
call "%~dp0dev-start.bat"
