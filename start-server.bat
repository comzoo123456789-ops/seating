@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 자리배치도 공유 서버를 시작합니다...
node server.js
pause
