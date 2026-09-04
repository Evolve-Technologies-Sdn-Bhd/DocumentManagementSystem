@echo off
title DMS BACKEND - PORT 4001 (Chrome/Edge Converter Only)
color 1F
cd /d "c:\Users\USER\Desktop\DocumentManagementSystem\backend"

set PORT=4001
set CORS_ORIGIN=http://localhost:3000,http://localhost:5173

echo ============================================================
echo   DMS BACKEND - SIMPLE PDF CONVERSION PIPELINE
echo ============================================================
echo   Backend Port      : 4001
echo   PDF Converter     : mammoth.js + puppeteer-core
echo   Browser Engine    : Google Chrome or Microsoft Edge
echo   (No LibreOffice required - Windows 10/11 has Edge built-in)
echo   Server URL        : http://localhost:4001
echo ============================================================
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
  echo [Port %PORT%] Detected existing process PID %%a - terminating...
  taskkill /F /PID %%a >nul 2>&1
  timeout /t 1 /nobreak >nul
)

echo Starting backend on port 4001...
echo.

node src\index.js

if %errorlevel% neq 0 (
  echo.
  echo ERROR: Server exited with code %errorlevel%
  pause
)
