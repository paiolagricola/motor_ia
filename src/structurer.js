import fs from 'node:fs';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as XLSXmod from 'xlsx';

const XLSX = XLSXmod.default ?? XLSXmod;

// Com ANTHROPIC_API_KEY definida, o estruturador chama a API direto (paga por
// token, mas centavos no Haiku). Sem a chave, tudo roda pelo Claude Code com o
// login da assinatura — sem cobrança extra.
export const AUTH_MODE = process.env.ANTHROPIC_API_KEY ? 'api' : 'assinatura';

const STRUCTURER_MODEL = process.env.STRUCTURER_MODEL || 'claude-haiku-4-5';

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'Título curto da melhoria (máx. 10 palavras)' },
    objetivo: { type: 'string', description: 'O que o usuário quer alcançar, em 1-2 frases' },
    contexto: {
      type: 'string',
      description: 'Contexto relevante extraído dos anexos e do pedido (dados de planilhas, o que os prints mostram). Só o essencial.',
    },
    mudancas: {
      type: 'array',
      description: 'Lista objetiva de mudanças a implementar, cada uma acionável',
      items: { type: 'string' },
    },
    fora_do_escopo: {
      type: 'array',
      description: 'O que explicitamente NÃO deve ser feito nesta rodada',
      items: { type: 'string' },
    },
    criterios_de_aceite: {
      type: 'array',
      description: 'Como verificar que ficou pronto — condições testáveis',
      items: { type: 'string' },
    },
    perguntas_abertas: {
      type: 'array',
      description: 'Ambiguidades que o usuário deveria resolver antes de executar (vazio se não houver)',
      items: { type: 'string' },
    },
  },
  required: ['titulo', 'objetivo', 'contexto', 'mudancas', 'fora_do_escopo', 'criterios_de_aceite', 'perguntas_abertas'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Você é um analista de requisitos que transforma pedidos informais de melhoria de software em specs técnicas enxutas para um agente de código (Claude Code) executar.

Regras:
- Seja conciso: a spec economiza tokens do agente executor. Não repita informação.
- Extraia dos anexos (prints, planilhas) apenas o que é relevante para a mudança pedida.
- Não invente requisitos que o usuário não pediu.
- Escreva as mudanças como instruções acionáveis ("Adicionar filtro X na tela Y"), não como desejos vagos.
- Se o pedido for ambíguo, registre em perguntas_abertas em vez de adivinhar.
- Responda em português.`;

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const SHEET_TYPES = new Set(['.xlsx', '.xls', '.csv']);

// Converte planilha em CSV compacto (limitado para não estourar contexto)
function sheetToText(filePath, maxChars = 20000) {
  const wb = XLSX.readFile(filePath);
  let out = '';
  for (const name of wb.SheetNames) {
    out += `--- aba: ${name} ---\n`;
    out += XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    out += '\n';
    if (out.length > maxChars) {
      out = out.slice(0, maxChars) + '\n[... planilha truncada para a spec ...]';
      break;
    }
  }
  return out;
}

function classifyFiles(files) {
  const visual = []; // imagens e PDFs — viram blocos (API) ou leitura via Read (assinatura)
  const textual = []; // planilhas e textos — sempre inline como texto
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_TYPES[ext] || ext === '.pdf') {
      visual.push({ file, ext });
    } else if (SHEET_TYPES.has(ext)) {
      textual.push({ name: file.originalname, text: sheetToText(file.path) });
    } else {
      textual.push({ name: file.originalname, text: fs.readFileSync(file.path, 'utf8').slice(0, 20000) });
    }
  }
  return { visual, textual };
}

function basePrompt(userText, textual, projectInfo) {
  let out = '';
  if (projectInfo) {
    out += `Projeto alvo: ${projectInfo.name} (stack/observações: ${projectInfo.notes || 'não informado'})\n\n`;
  }
  for (const t of textual) {
    out += `Conteúdo do arquivo "${t.name}":\n${t.text}\n\n`;
  }
  out += `Pedido do usuário:\n${userText}`;
  return out;
}

// ---------- modo API (chave ANTHROPIC_API_KEY): saída JSON validada ----------

async function structureViaApi(userText, files, projectInfo) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const { visual, textual } = classifyFiles(files);

  const blocks = visual.map(({ file, ext }) =>
    ext === '.pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fs.readFileSync(file.path).toString('base64') } }
      : { type: 'image', source: { type: 'base64', media_type: IMAGE_TYPES[ext], data: fs.readFileSync(file.path).toString('base64') } }
  );
  blocks.push({ type: 'text', text: basePrompt(userText, textual, projectInfo) });

  const response = await client.messages.create({
    model: STRUCTURER_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: SPEC_SCHEMA } },
    messages: [{ role: 'user', content: blocks }],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  return {
    spec: JSON.parse(text),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

// ---------- modo assinatura: estrutura via Claude Code (login da conta) ----------

async function structureViaSubscription(userText, files, projectInfo) {
  const { visual, textual } = classifyFiles(files);

  let prompt = SYSTEM_PROMPT + '\n\n';
  if (visual.length) {
    prompt += 'Antes de escrever a spec, leia estes anexos com a ferramenta Read:\n';
    prompt += visual.map(({ file }) => `- ${path.resolve(file.path)} (original: ${file.originalname})`).join('\n');
    prompt += '\n\n';
  }
  prompt += basePrompt(userText, textual, projectInfo);
  prompt +=
    '\n\nResponda SOMENTE com um objeto JSON válido (sem markdown, sem cercas de código) com exatamente estas chaves: ' +
    'titulo (string), objetivo (string), contexto (string), mudancas (array de strings), ' +
    'fora_do_escopo (array de strings), criterios_de_aceite (array de strings), perguntas_abertas (array de strings).';

  let finalText = '';
  let usage = {};
  for await (const message of query({
    prompt,
    options: {
      allowedTools: ['Read'],
      permissionMode: 'acceptEdits',
      maxTurns: 10,
      ...(process.env.STRUCTURER_MODEL ? { model: process.env.STRUCTURER_MODEL } : {}),
    },
  })) {
    if (message.type === 'result') {
      finalText = message.result ?? '';
      usage = {
        input_tokens: message.usage?.input_tokens ?? null,
        output_tokens: message.usage?.output_tokens ?? null,
      };
    }
  }

  // extrai o objeto JSON da resposta (tolerante a texto em volta)
  const start = finalText.indexOf('{');
  const end = finalText.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('O estruturador não retornou JSON: ' + finalText.slice(0, 300));
  const spec = JSON.parse(finalText.slice(start, end + 1));
  return { spec, usage };
}

/**
 * Transforma o pedido em linguagem natural + anexos numa spec estruturada.
 */
export async function structureRequest(userText, files = [], projectInfo = null) {
  return AUTH_MODE === 'api'
    ? structureViaApi(userText, files, projectInfo)
    : structureViaSubscription(userText, files, projectInfo);
}

/**
 * Renderiza a spec aprovada como prompt markdown enxuto para o Claude Code.
 */
export function specToPrompt(spec) {
  const lines = [
    `# ${spec.titulo}`,
    '',
    `## Objetivo`,
    spec.objetivo,
    '',
    `## Contexto`,
    spec.contexto,
    '',
    `## Mudanças a implementar`,
    ...spec.mudancas.map((m, i) => `${i + 1}. ${m}`),
  ];
  if (spec.fora_do_escopo?.length) {
    lines.push('', '## Fora do escopo (NÃO fazer)', ...spec.fora_do_escopo.map((m) => `- ${m}`));
  }
  if (spec.criterios_de_aceite?.length) {
    lines.push('', '## Critérios de aceite', ...spec.criterios_de_aceite.map((m) => `- ${m}`));
  }
  lines.push(
    '',
    'Implemente as mudanças acima. Ao terminar, rode os testes/build do projeto se existirem e resuma o que foi feito em 3-5 frases.'
  );
  return lines.join('\n');
}
