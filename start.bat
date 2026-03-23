@echo off
chcp 65001 >nul
title 铭晟管理系统

echo ========================================
echo    铭晟管理系统 - 启动中...
echo ========================================
echo.

cd /d "%~dp0backend"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo.
echo Starting server at: http://localhost:3198
echo Press Ctrl+C to stop
echo.

start "" http://localhost:3198
node server.js

pause