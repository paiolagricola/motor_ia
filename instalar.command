#!/bin/bash
# Motor IA — instalação automática (Mac/Linux). Dois cliques e pronto.
cd "$(dirname "$0")"

echo "============================================"
echo "  MOTOR IA — instalação automática"
echo "============================================"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] O Node.js não está instalado neste computador."
  echo "Vou abrir a página de download. Instale a versão LTS e rode este arquivo de novo."
  open "https://nodejs.org/pt" 2>/dev/null || xdg-open "https://nodejs.org/pt"
  read -rp "Pressione Enter para sair..."
  exit 1
fi

echo "[1/3] Instalando dependências (pode levar 1–2 minutos)..."
npm install || { echo "[ERRO] Instalação falhou — tire um print e envie no chat."; read -rp "Enter para sair..."; exit 1; }

echo
echo "============================================"
echo "[2/3] Conectar sua conta Claude (assinatura)"
echo "============================================"
echo "Uma tela do Claude Code vai abrir agora."
echo "  1. Digite  /login   e aperte Enter"
echo "  2. Siga o login no navegador"
echo "  3. De volta na tela, digite  /exit  e aperte Enter"
echo
echo "(Se você já fez login antes, só digite /exit)"
read -rp "Pressione Enter para continuar..."
npx @anthropic-ai/claude-code

echo
echo "[3/3] Iniciando o Motor IA... o painel abre no navegador."
echo "Para desligar, feche esta janela (ou Ctrl+C)."
( sleep 3 && (open http://localhost:4000 2>/dev/null || xdg-open http://localhost:4000) ) &
npm start
