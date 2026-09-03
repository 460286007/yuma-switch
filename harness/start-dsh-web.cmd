@echo off
rem Starts the DeepSeek Harness Web UI in this console window.
rem Requires Node.js from "C:\Program Files\nodejs"; adjust if it moves again.
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
title dsh-harness-web
pnpm dsh web
echo.
echo dsh web exited with code %ERRORLEVEL%.
pause
