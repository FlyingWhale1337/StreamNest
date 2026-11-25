@echo off
chcp 65001 >nul
title StreamNest
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js не найден. Установите Node.js 22 LTS или новее: https://nodejs.org
  echo.
  pause
  exit /b 1
)
node server\index.js
pause
