@echo off
chcp 65001 >nul
title StreamNest - сборка exe
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js не найден. Установите Node.js 22 LTS или новее: https://nodejs.org
  echo   Node.js not found. Install Node.js 22 LTS or newer: https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo.
echo   [1/3] Скачиваю Electron (один раз, около 150 МБ)...
echo         Downloading Electron (once, about 150 MB)...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

set "WCS_DIR=%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
set "WCS_ZIP=%TEMP%\winCodeSign-2.6.0.7z"
if exist "%WCS_DIR%\rcedit-x64.exe" goto build

echo.
echo   [2/3] Готовлю инструменты сборки / Preparing build tools...
echo.
curl -L --fail -o "%WCS_ZIP%" "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
if errorlevel 1 goto fail
if not exist "%WCS_DIR%" mkdir "%WCS_DIR%"
"node_modules\7zip-bin\win\x64\7za.exe" x -y -bd "%WCS_ZIP%" "-o%WCS_DIR%" >nul 2>nul
del "%WCS_ZIP%" >nul 2>nul
if not exist "%WCS_DIR%\rcedit-x64.exe" (
  echo   Не удалось распаковать winCodeSign / Could not unpack winCodeSign
  goto fail
)

:build
echo.
echo   [3/3] Собираю StreamNest.exe / Building StreamNest.exe...
echo.
call npx electron-builder --win portable --x64
if errorlevel 1 goto fail

echo.
echo   Готово! Программа: dist\StreamNest.exe
echo   Done! The app is at: dist\StreamNest.exe
echo.
start "" explorer "%~dp0dist"
pause
exit /b 0

:fail
echo.
echo   Сборка не удалась — пришлите текст ошибки выше.
echo   Build failed — please send the error text above.
echo.
pause
exit /b 1
