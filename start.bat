@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. Node.js 18 이상을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
echo 결함관리서비스 v1.0 시작...
node backend\server.js
pause
