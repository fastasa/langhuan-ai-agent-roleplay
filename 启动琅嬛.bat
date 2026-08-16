@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Langhuan Local

echo.
echo ========================================
echo   Langhuan Local - One-click launcher
echo ========================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto no_node

node.exe -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)"
if errorlevel 1 goto old_node

where npm.cmd >nul 2>&1
if errorlevel 1 goto no_npm

set "NPM_MAJOR="
for /f "tokens=1 delims=." %%V in ('npm.cmd --version 2^>nul') do set "NPM_MAJOR=%%V"
if not defined NPM_MAJOR goto no_npm
node.exe -e "process.exit(Number(process.argv[1]) >= 10 ? 0 : 1)" "%NPM_MAJOR%"
if errorlevel 1 goto old_npm

if not exist ".env" (
  echo [Setup] Creating local .env ...
  copy /Y ".env.example" ".env" >nul
  if errorlevel 1 goto env_failed
)

if not exist "node_modules\.package-lock.json" (
  echo [Setup] Installing dependencies for the first run ...
  call npm.cmd ci
  if errorlevel 1 goto install_failed
)

if not exist "dist\index.html" (
  echo [Setup] Building the app for the first run ...
  call npm.cmd run build
  if errorlevel 1 goto build_failed
)

set "APP_PORT=3217"
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /B /C:"PORT=" ".env" 2^>nul`) do set "APP_PORT=%%B"
node.exe -e "const port = Number(process.argv[1]); process.exit(Number.isInteger(port) && port > 0 && port < 65536 ? 0 : 1)" "%APP_PORT%"
if errorlevel 1 goto invalid_port

set "NODE_ENV=production"
if /I not "%~1"=="--no-browser" (
  start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-local-page.ps1" -Port "%APP_PORT%"
)

echo.
echo [Start] The browser will open when the app is ready.
echo [URL]   http://127.0.0.1:%APP_PORT%
echo [Stop]  Press Ctrl+C in this window.
echo.
call npm.cmd start
set "APP_EXIT=%ERRORLEVEL%"

if "%APP_EXIT%"=="0" goto stopped
echo.
echo [Error] The service exited with code %APP_EXIT%.
echo Keep the messages above for troubleshooting.
pause
exit /b %APP_EXIT%

:stopped
echo.
echo The service has stopped.
pause
exit /b 0

:no_node
echo [Error] Node.js was not found.
echo Install Node.js 20.19 or newer, then run this file again.
pause
exit /b 1

:old_node
echo [Error] Node.js is too old.
node.exe --version
echo Upgrade to Node.js 20.19 or newer.
pause
exit /b 1

:no_npm
echo [Error] npm was not found.
echo Reinstall a Node.js distribution that includes npm.
pause
exit /b 1

:old_npm
echo [Error] npm is too old.
call npm.cmd --version
echo Upgrade to npm 10 or newer.
pause
exit /b 1

:env_failed
echo [Error] Could not create .env from .env.example.
pause
exit /b 1

:install_failed
echo [Error] Dependency installation failed. Check the network or npm error above.
pause
exit /b 1

:build_failed
echo [Error] The production build failed. Check the error above.
pause
exit /b 1

:invalid_port
echo [Error] PORT in .env must be an integer from 1 to 65535.
pause
exit /b 1
