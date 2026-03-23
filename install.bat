@echo off
chcp 65001 >nul
title 铭晟管理系统安装

echo ========================================
echo    铭晟管理系统 - 初始化与安装程序
echo ========================================
echo.

:: 检查Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [√] Node.js 已安装
node --version

:: 进入后端目录
cd /d "%~dp0backend"

:: 安装依赖
echo.
echo [1/2] 正在安装后端依赖...
call npm install
if %errorlevel% neq 0 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)

echo.
echo [√] 后端依赖安装完成

:: 进入前端目录
cd /d "%~dp0frontend"

echo.
echo [2/2] 正在安装并编译前端环境...这可能需要一点时间...
call npm install
call npm run build
if %errorlevel% neq 0 (
    echo [错误] 前端编译失败
    pause
    exit /b 1
)

echo.
echo [√] 前端依赖及编译完成
echo.
echo ========================================
echo    安装完成！
echo ========================================
echo.
echo.
echo 请直接回到根目录双击运行 start.bat 启动系统！
echo.
pause
