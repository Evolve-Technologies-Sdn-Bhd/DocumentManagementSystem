@echo off
REM DMS Full Stack Startup Launcher
REM Double-click this file to run the full startup sequence.
setlocal
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoLogo -NoProfile -File "%~dp0Start-All-Services.ps1"
endlocal
