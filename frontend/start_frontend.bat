@echo off
title DMS FRONTEND (Vite) - connects to backend PORT 4001
color 2F
cd /d "c:\Users\USER\Desktop\DocumentManagementSystem\frontend"

echo ============================================================
echo   DMS FRONTEND DEV SERVER
echo ============================================================
echo   Frontend URL : http://localhost:3000
echo   Backend API  : http://localhost:4001/api  (via proxy + axios)
echo ============================================================
echo.
echo Starting Vite dev server... wait for "Local:" line.
echo.

call npm run dev

if %errorlevel% neq 0 (
  echo.
  echo ERROR: Frontend exited with code %errorlevel%
  pause
)
