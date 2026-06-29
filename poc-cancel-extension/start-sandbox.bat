@echo off
cd /d "%~dp0"
title kkj-sandbox (http://localhost:8000)
echo ============================================================
echo  끊어줌 샌드박스 서버
echo  열기: http://localhost:8000/subscriptions.html?mode=success
echo  modes: success ^| fail ^| indeterminate ^| 2fa
echo  (이 창을 닫으면 서버가 꺼집니다)
echo ============================================================
node server.js 8000
echo.
echo 서버가 종료되었습니다. 포트 8000이 이미 사용 중이면 이미 떠 있는 것입니다.
pause
