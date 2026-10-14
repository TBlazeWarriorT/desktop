@echo off
rem Full dev rebuild: only needed after main-process or build config changes (UI changes just need Ctrl+R).
cd /d "%~dp0"
taskkill /im GitHubDesktop-dev.exe /f >nul 2>&1
call node vendor\yarn-1.21.1.js build:dev
if errorlevel 1 (
  echo.
  echo BUILD FAILED
  pause
  exit /b 1
)
echo.
echo Build ok. Open with dev-start.bat
pause
