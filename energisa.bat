@echo off
chcp 65001 >nul
title Motor IA - Consulta Energisa
cd /d "%~dp0"

echo ============================================
echo   ENERGISA - faturas em aberto + injetada
echo ============================================
echo.

if not exist node_modules\playwright (
  echo [1/2] Preparando o navegador da consulta ^(so na primeira vez^)...
  call npm install
)
call npx playwright install chromium

echo.
echo [2/2] Consultando a Energisa...
call npm run energisa
if errorlevel 1 (
  echo.
  echo Se o erro falar de CAPTCHA ou codigo de verificacao, rode assim:
  echo    npm run energisa -- --visivel
  echo ^(abre o navegador para voce concluir o login uma vez^)
)
echo.
pause
