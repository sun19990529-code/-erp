@echo off
chcp 65001 >nul
title ERP-MES v1.7.0 - Document Generator

echo ============================================
echo   ERP-MES Management System
echo   HTML Document Generator v1.7.0
echo ============================================
echo.
echo Generating HTML documents...
echo.
node generate-pdf.js
echo.
echo ============================================
echo Done! Open the .html files in browser.
echo To create PDF: Print in browser, select
echo "Microsoft Print to PDF", then Save.
echo ============================================
pause
