// Extrai os dados relevantes do PDF de uma fatura Energisa:
// valor, vencimento, mês de referência, consumo e — o ponto central para quem
// tem geração solar — a ENERGIA INJETADA e o saldo de créditos (SCEE).
//
// Os layouts variam um pouco entre as distribuidoras do grupo (MT, MS, TO...),
// então tudo é extraído por expressões regulares tolerantes e as linhas brutas
// ficam guardadas no resultado para conferência.

import fs from 'node:fs';
import { PDFParse } from 'pdf-parse';

function numeroBr(str) {
  if (str == null) return null;
  const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function acharPrimeiro(texto, regexes) {
  for (const re of regexes) {
    const m = texto.match(re);
    if (m) return m[1];
  }
  return null;
}

// Numa linha de item da fatura ("ENERGIA INJETADA ... kWh 1.234,56 0,75 -925,92"),
// a quantidade em kWh costuma ser o primeiro número depois da unidade "kWh".
function quantidadeKwhDaLinha(linha) {
  const aposUnidade = linha.match(/kWh\s*[.:]?\s*(-?[\d.]+,\d+|-?\d+)/i);
  if (aposUnidade) return Math.abs(numeroBr(aposUnidade[1]));
  const numeros = [...linha.matchAll(/-?[\d.]+,\d+/g)].map((m) => Math.abs(numeroBr(m[0])));
  return numeros.length ? numeros[0] : null;
}

/**
 * @param {string} caminhoPdf
 * @returns {Promise<object>} dados extraídos da fatura
 */
export async function extrairFatura(caminhoPdf) {
  const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(caminhoPdf)) });
  const { text } = await parser.getText();
  await parser.destroy?.();
  const linhas = text.split('\n').map((l) => l.trim()).filter(Boolean);

  const referencia = acharPrimeiro(text, [
    /(?:refer[êe]nc\w*|compet[êe]ncia|m[êe]s\/ano)\s*[:.]?\s*(\d{2}\/\d{4})/i,
    /\b([A-Z]{3}\/\d{4})\b/,
  ]);

  const vencimento = acharPrimeiro(text, [
    /venc\w*\s*[:.]?\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]);

  const valorTotal = numeroBr(acharPrimeiro(text, [
    /total\s+a\s+pagar\s*[:.]?\s*R?\$?\s*\**\s*([\d.]+,\d{2})/i,
    /valor\s+(?:total|a\s+pagar)\s*[:.]?\s*R?\$?\s*\**\s*([\d.]+,\d{2})/i,
    /R\$\s*\**\s*([\d.]+,\d{2})\s*(?:at[ée]|venc)/i,
  ]));

  const unidadeConsumidora = acharPrimeiro(text, [
    /(?:unidade\s+consumidora|c[óo]digo\s+d[oa]\s+(?:cliente|uc)|n[º°.]?\s*da\s+uc)\s*[:.]?\s*(\d{4,12})/i,
    /\bUC\s*[:.]?\s*(\d{4,12})\b/,
  ]);

  // Linhas de energia injetada (podem ser várias: GD I/GD II, ponta/fora ponta, mUC/oUC)
  const linhasInjetada = linhas.filter((l) => /INJET/i.test(l));
  const energiaInjetadaKwh = linhasInjetada
    .map(quantidadeKwhDaLinha)
    .filter((n) => n != null)
    .reduce((a, b) => a + b, 0) || (linhasInjetada.length ? null : 0);

  // Consumo faturado (linha "CONSUMO" ou "ENERGIA ELÉTRICA" / "ENERGIA ATIVA FORNECIDA")
  const linhasConsumo = linhas.filter((l) => /(CONSUMO|ENERGIA\s+(EL[ÉE]TRICA|ATIVA\s+FORN))/i.test(l) && !/INJET/i.test(l));
  const consumoKwh = linhasConsumo.length ? quantidadeKwhDaLinha(linhasConsumo[0]) : null;

  // Saldo de créditos do sistema de compensação (SCEE)
  const linhasSaldo = linhas.filter((l) => /(SALDO|CR[ÉE]DITO)/i.test(l) && /kWh|GERA|SCEE|ENERG/i.test(l));
  const saldoCreditosKwh = acharPrimeiro(text, [
    /saldo\s+(?:atual|acumulado|de\s+cr[ée]ditos?)[^\d]*([\d.]+,?\d*)\s*kWh/i,
    /cr[ée]dito\s+de\s+energia[^\d]*([\d.]+,?\d*)\s*kWh/i,
  ]);

  return {
    arquivo: caminhoPdf,
    unidadeConsumidora,
    referencia,
    vencimento,
    valorTotal,
    consumoKwh,
    energiaInjetadaKwh,
    saldoCreditosKwh: numeroBr(saldoCreditosKwh),
    // linhas brutas para conferência manual quando algum campo vier estranho
    conferencia: {
      injetada: linhasInjetada,
      consumo: linhasConsumo.slice(0, 3),
      saldo: linhasSaldo.slice(0, 5),
    },
  };
}
