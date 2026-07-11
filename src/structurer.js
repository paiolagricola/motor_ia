import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSXmod from 'xlsx';

const XLSX = XLSXmod.default ?? XLSXmod;

const client = new Anthropic();

const STRUCTURER_MODEL = process.env.STRUCTURER_MODEL || 'claude-haiku-4-5';

// Schema da spec que o Claude Code vai receber. Campos em português para
// bater com a UI; a spec final é renderizada como markdown enxuto.
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

// Monta os blocos de conteúdo (texto + imagens + documentos) a partir dos anexos
function buildContentBlocks(userText, files, projectInfo) {
  const blocks = [];

  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_TYPES[ext]) {
      blocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: IMAGE_TYPES[ext],
          data: fs.readFileSync(file.path).toString('base64'),
        },
      });
    } else if (ext === '.pdf') {
      blocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: fs.readFileSync(file.path).toString('base64'),
        },
      });
    } else if (SHEET_TYPES.has(ext)) {
      blocks.push({
        type: 'text',
        text: `Conteúdo da planilha "${file.originalname}":\n${sheetToText(file.path)}`,
      });
    } else {
      // arquivos de texto genéricos (md, txt, json...)
      const raw = fs.readFileSync(file.path, 'utf8').slice(0, 20000);
      blocks.push({ type: 'text', text: `Conteúdo do arquivo "${file.originalname}":\n${raw}` });
    }
  }

  let text = '';
  if (projectInfo) {
    text += `Projeto alvo: ${projectInfo.name} (stack/observações: ${projectInfo.notes || 'não informado'})\n\n`;
  }
  text += `Pedido do usuário:\n${userText}`;
  blocks.push({ type: 'text', text });

  return blocks;
}

/**
 * Transforma o pedido em linguagem natural + anexos numa spec estruturada.
 * @returns {Promise<object>} spec validada contra SPEC_SCHEMA
 */
export async function structureRequest(userText, files = [], projectInfo = null) {
  const response = await client.messages.create({
    model: STRUCTURER_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: 'json_schema', schema: SPEC_SCHEMA },
    },
    messages: [
      { role: 'user', content: buildContentBlocks(userText, files, projectInfo) },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '{}';
  const spec = JSON.parse(text);
  return {
    spec,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
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
