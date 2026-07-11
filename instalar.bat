@echo off
chcp 65001 >nul
title Motor IA - Instalacao
cd /d "%~dp0"

echo ============================================
echo   MOTOR IA - instalacao automatica
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] O Node.js nao esta instalado neste computador.
  echo.
  echo Vou abrir a pagina de download. Instale a versao LTS
  echo ^(botao verde^), depois clique neste arquivo de novo.
  start https://nodejs.org/pt
  pause
  exit /b 1
)

echo [1/3] Instalando dependencias ^(pode levar 1-2 minutos^)...
call npm install
if errorlevel 1 (
  echo.
  echo [ERRO] A instalacao falhou. Tire um print desta janela e envie no chat.
  pause
  exit /b 1
)

echo.
echo ============================================
echo [2/3] Conectar sua conta Claude ^(assinatura^)
echo ============================================
echo Uma tela do Claude Code vai abrir agora.
echo   1. Digite  /login   e aperte Enter
echo   2. Siga o login no navegador
echo   3. De volta na tela, digite  /exit  e aperte Enter
echo.
echo ^(Se voce ja fez login antes, so digite /exit^)
pause
call npx @anthropic-ai/claude-code

echo.
echo [3/3] Iniciando o Motor IA...
echo O painel vai abrir no navegador. Para desligar, feche esta janela.
start http://localhost:4000
call npm start
pause
