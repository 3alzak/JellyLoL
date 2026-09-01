@echo off
:: 한글 깨짐 방지
chcp 65001 >nul
title 🐛 젤리의 내전 도우미 (JellyLoL) 원클릭 통합 배포 터미널

:: 1. 작업 폴더로 이동
cd /d "C:\jelly project"

echo ====================================================================
echo    🐛 젤리의 내전 도우미 (JellyLoL) 통합 배포 (Pages + Workers)
echo ====================================================================
echo.
echo  [1/2] 깃허브 원격 저장소의 최신 변경 사항을 먼저 확인하고 내려받습니다...
echo.

:: 2. 원격 저장소 변경 사항 안전하게 병합
git pull --no-edit

echo.
echo ====================================================================
echo  [2/2] 준비 완료! 프론트엔드(Pages)와 백엔드(Workers)를 동시 배포합니다.
echo  [안내] 아래 명령어가 자동으로 입력되어 있습니다.
echo  [안내] 충돌(CONFLICT)이 없다면 그대로 [Enter] 키만 누르세요!
echo ====================================================================
echo.

:: 3. 프론트엔드 Git Push + 백엔드 Wrangler Deploy 통합 명령어 자동 타이핑
powershell -NoProfile -Command "$wshell = New-Object -ComObject WScript.Shell; sleep -m 500; $wshell.SendKeys('git add . && git commit -m \"Update\" && git push && npx wrangler deploy')"

:: 4. 사용자가 직접 엔터를 칠 수 있게 대기
cmd /k