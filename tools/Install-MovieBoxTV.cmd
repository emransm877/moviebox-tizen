@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-MovieBoxTV.ps1"
if errorlevel 1 echo MovieBox TV installation did not complete. Read the error above and INSTALL-TV.md.
pause
