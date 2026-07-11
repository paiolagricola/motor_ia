@echo off
chcp 65001 >nul
title Motor IA
cd /d "%~dp0"
echo Iniciando o Motor IA... o painel abre no navegador.
echo Para desligar, feche esta janela.
start http://localhost:4000
call npm start
pause
