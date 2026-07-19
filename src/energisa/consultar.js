// Orquestra a consulta mensal: baixa as faturas em aberto no portal da
// Energisa, extrai os dados de cada PDF (valor, vencimento, energia injetada,
// saldo de créditos), atualiza o histórico e gera um relatório legível.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baixarFaturasEmAberto } from './portal.js';
import { extrairFatura } from './fatura.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
export const DIR_DADOS = path.join(ROOT, 'dados', 'energisa');

function carregarHistorico() {
  const p = path.join(DIR_DADOS, 'historico.json');
  if (!fs.existsSync(p)) return { consultas: [], faturas: [] };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function salvarHistorico(historico) {
  fs.mkdirSync(DIR_DADOS, { recursive: true });
  fs.writeFileSync(path.join(DIR_DADOS, 'historico.json'), JSON.stringify(historico, null, 2) + '\n');
}

function chaveFatura(f) {
  return `${f.unidadeConsumidora || '?'}|${f.referencia || path.basename(f.arquivo)}`;
}

function moeda(v) {
  return v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function kwh(v) {
  return v == null ? '—' : `${v.toLocaleString('pt-BR')} kWh`;
}

function gerarRelatorio(faturas, quando) {
  const linhas = [
    `# ⚡ Energisa — faturas em aberto (${quando.toLocaleDateString('pt-BR')})`,
    '',
    faturas.length
      ? `| UC | Referência | Vencimento | Valor | Consumo | Energia injetada | Saldo créditos |`
      : 'Nenhuma fatura em aberto encontrada nesta consulta.',
  ];
  if (faturas.length) {
    linhas.push('|---|---|---|---|---|---|---|');
    for (const f of faturas) {
      linhas.push(`| ${f.unidadeConsumidora || '—'} | ${f.referencia || '—'} | ${f.vencimento || '—'} | ${moeda(f.valorTotal)} | ${kwh(f.consumoKwh)} | ${kwh(f.energiaInjetadaKwh)} | ${kwh(f.saldoCreditosKwh)} |`);
    }
    const totalValor = faturas.reduce((a, f) => a + (f.valorTotal || 0), 0);
    const totalInjetada = faturas.reduce((a, f) => a + (f.energiaInjetadaKwh || 0), 0);
    linhas.push('', `**Total em aberto:** ${moeda(totalValor)} · **Total injetado no período:** ${kwh(totalInjetada)}`);
  }
  linhas.push('', `PDFs e dados brutos em \`dados/energisa/\`. Campos estranhos? Confira as linhas brutas no \`historico.json\` (chave \`conferencia\`).`, '');
  return linhas.join('\n');
}

/**
 * Executa a consulta completa. Usada pelo CLI (scripts/energisa.js),
 * pelo agendador mensal e pelo endpoint do painel.
 */
export async function consultarEnergisa({ visivel = false } = {}) {
  const documento = process.env.ENERGISA_CPF_CNPJ;
  const senha = process.env.ENERGISA_SENHA;
  if (!documento || !senha) {
    throw new Error('Configure ENERGISA_CPF_CNPJ e ENERGISA_SENHA no arquivo .env (veja docs/ENERGISA.md).');
  }

  const quando = new Date();
  console.log('🔎 Consultando faturas em aberto na Energisa...');
  const { arquivos } = await baixarFaturasEmAberto({
    documento: documento.replace(/\D/g, ''),
    senha,
    dirDados: DIR_DADOS,
    visivel,
  });

  const faturas = [];
  for (const arquivo of arquivos) {
    try {
      faturas.push(await extrairFatura(arquivo));
    } catch (err) {
      console.warn(`⚠️  Não consegui ler ${path.basename(arquivo)}: ${err.message}`);
      faturas.push({ arquivo, erroLeitura: err.message });
    }
  }

  // Histórico: acumula por UC+referência (reconsultar o mesmo mês só atualiza)
  const historico = carregarHistorico();
  historico.consultas.push({ em: quando.toISOString(), faturasEncontradas: faturas.length });
  for (const f of faturas) {
    const chave = chaveFatura(f);
    const i = historico.faturas.findIndex((x) => chaveFatura(x) === chave);
    const registro = { ...f, atualizadoEm: quando.toISOString() };
    if (i >= 0) historico.faturas[i] = registro;
    else historico.faturas.push(registro);
  }
  salvarHistorico(historico);

  const relatorio = gerarRelatorio(faturas, quando);
  const nomeRel = `relatorio-${quando.toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(path.join(DIR_DADOS, nomeRel), relatorio);

  console.log('\n' + relatorio);
  console.log(`💾 Histórico: dados/energisa/historico.json · Relatório: dados/energisa/${nomeRel}`);
  return { faturas, relatorio };
}
