#!/bin/bash
# Motor IA — iniciar (Mac/Linux)
cd "$(dirname "$0")"
echo "Iniciando o Motor IA... o painel abre no navegador."
( sleep 3 && (open http://localhost:4000 2>/dev/null || xdg-open http://localhost:4000) ) &
npm start
