@echo off
chcp 65001 >nul
title ERP-MES v1.5.1 - Document Generator

echo ============================================
echo   ERP-MES Management System
echo   HTML Document Generator v1.5.1
echo ============================================
echo.
echo Generating HTML documents from:
echo   - 项目需求文档.md
echo.
node generate-pdf.js
echo.
echo ============================================
echo Done! Open the .html files in browser.
echo ============================================
pause
