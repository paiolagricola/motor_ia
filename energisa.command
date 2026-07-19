#!/bin/bash
# Consulta Energisa — dois cliques no Mac
cd "$(dirname "$0")"

echo "============================================"
echo "  ENERGISA - faturas em aberto + injetada"
echo "============================================"
echo

[ -d node_modules/playwright ] || npm install
npx playwright install chromium

npm run energisa || {
  echo
  echo "Se o erro falar de CAPTCHA ou código de verificação, rode assim:"
  echo "   npm run energisa -- --visivel"
  echo "(abre o navegador para você concluir o login uma vez)"
}
echo
read -p "Pressione Enter para fechar..."
