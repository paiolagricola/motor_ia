#!/usr/bin/env node
// Consulta manual das faturas Energisa:
//   npm run energisa                → consulta invisível (headless)
//   npm run energisa -- --visivel   → abre o navegador (1º login / captcha)

import 'dotenv/config';
import { consultarEnergisa } from '../src/energisa/consultar.js';

const visivel = process.argv.includes('--visivel');

consultarEnergisa({ visivel })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  });
