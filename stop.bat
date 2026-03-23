@echo off
chcp 65001 >nul
title 铭晟管理系统 - 停止

echo 正在强制阻断所有后台服务进程...

:: 取消复杂的端口遍历，直接暴力摘除 Node 解释器实体
taskkill /F /IM node.exe >nul 2>&1

echo.
echo [√] 系统已完全停止。您可以安全关闭本窗口。
pause
