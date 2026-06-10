@echo off
cd /d "%~dp0"
start "Last Route Server" /min node tools\serve.mjs
timeout /t 1 >nul
start "" http://localhost:8765
