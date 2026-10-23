@echo off
rem Command Dock - avvio con doppio click (Windows).
rem La prima volta installa le dipendenze e prepara la configurazione.
setlocal
title Command Dock
cd /d "%~dp0"

where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo Node.js non e' installato.
where winget >nul 2>nul
if errorlevel 1 goto manual

choice /M "Installo Node.js LTS adesso con winget"
if errorlevel 2 goto manual
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if not errorlevel 1 goto run
echo.
echo Installazione completata: chiudi questa finestra e riapri start.bat
pause
exit /b 0

:manual
echo Scarica Node.js LTS da https://nodejs.org, installalo e riapri start.bat
pause
exit /b 1

:run
node scripts\bootstrap.js %*
if errorlevel 1 pause
