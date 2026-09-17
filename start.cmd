@echo off
setlocal
title Pieces of Us
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Download it from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First run: installing the game. This takes about a minute...
  echo.
  call npm install --no-fund --no-audit
  if errorlevel 1 goto fail
)

if not exist dist\index.html (
  echo.
  echo   Building the game...
  echo.
  call npm run build
  if errorlevel 1 goto fail
)

node server\index.mjs --open
goto end

:fail
echo.
echo   Something went wrong - scroll up to see the error.
echo.
pause
exit /b 1

:end
endlocal
