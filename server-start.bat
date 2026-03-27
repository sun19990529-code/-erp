@echo off
chcp 65001 >nul
title 铭晟ERP服务器启动（管理员）

:: ========================================
:: 检查管理员权限
:: ========================================
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [提示] 需要管理员权限，正在请求提升...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ========================================
echo    铭晟ERP管理系统 v1.6.0 - 服务器启动
echo    管理员模式
echo ========================================
echo.

cd /d "%~dp0"

:: ========================================
:: 检查前端是否已构建
:: ========================================
if not exist "frontend\dist" (
    echo [提示] 前端未构建，请先运行 install.bat 或手动执行 npm run build
    echo.
    pause
    exit /b
)

:: ========================================
:: 停止已有服务并启动
:: ========================================
echo [启动] 正在启动服务...

:: 尝试用PM2管理
where pm2 >nul 2>&1
if %errorlevel% equ 0 (
    pm2 stop erp >nul 2>&1
    cd backend
    pm2 start server.js --name erp
    pm2 save >nul 2>&1
    cd ..
    echo.
    echo ========================================
    echo    服务已启动（PM2 托管）
    echo    访问地址: http://localhost:3198
    echo    管理命令: pm2 status / pm2 logs erp
    echo ========================================
) else (
    echo [提示] 未检测到PM2，使用直接启动模式
    echo [提示] 建议安装PM2: npm install -g pm2
    echo.
    echo 启动服务: http://localhost:3198
    echo 按 Ctrl+C 停止服务
    echo.
    start "" http://localhost:3198
    cd backend
    node server.js
    cd ..
)

echo.
pause
