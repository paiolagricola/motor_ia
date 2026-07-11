import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { structureRequest, specToPrompt, AUTH_MODE } from './structurer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 4000;

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const upload = multer({ dest: path.join(ROOT, 'uploads'), limits: { fileSize: 25 * 1024 * 1024 } });

// ---------- projetos ----------

function loadProjects() {
  const custom = path.join(ROOT, 'config', 'projects.json');
  const example = path.join(ROOT, 'config', 'projects.example.json');
  const file = fs.existsSync(custom) ? custom : example;
  return JSON.parse(fs.readFileSync(file, 'utf8')).projects;
}

function getProject(id) {
  return loadProjects().find((p) => p.id === id);
}

app.get('/api/projects', (_req, res) => {
  res.json({
    authMode: AUTH_MODE,
    projects: loadProjects().map(({ id, name, previewUrl }) => ({ id, name, previewUrl })),
  });
});

// ---------- passo 1: estruturar o pedido ----------

app.post('/api/structure', upload.array('files', 10), async (req, res) => {
  try {
    const project = getProject(req.body.projectId);
    const result = await structureRequest(req.body.text, req.files || [], project);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  } finally {
    // anexos já foram lidos para dentro da spec; não precisamos guardar
    for (const f of req.files || []) fs.unlink(f.path, () => {});
  }
});

// ---------- passo 2: executar via Claude Code (Agent SDK) ----------

app.post('/api/execute', async (req, res) => {
  const { spec, projectId } = req.body;
  const project = getProject(projectId);
  if (!project) return res.status(400).send('Projeto não encontrado. Configure config/projects.json.');
  if (!fs.existsSync(project.path)) {
    return res.status(400).send(`Caminho do projeto não existe: ${project.path}`);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);

  const prompt = specToPrompt(spec);
  send({ type: 'text', text: '— Spec enviada —\n' + prompt });

  try {
    const options = {
      cwd: project.path,
      // carrega CLAUDE.md, .mcp.json e settings do próprio projeto
      settingSources: ['project'],
      // autonomia suficiente para editar e rodar comandos sem prompt interativo
      permissionMode: 'acceptEdits',
      allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'WebFetch', 'TodoWrite'],
      maxTurns: 80,
    };
    if (process.env.EXECUTOR_MODEL) options.model = process.env.EXECUTOR_MODEL;

    for await (const message of query({ prompt, options })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            send({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            const detail = block.input?.file_path || block.input?.command || block.input?.pattern || '';
            send({ type: 'tool', text: `${block.name} ${String(detail).slice(0, 120)}` });
          }
        }
      } else if (message.type === 'result') {
        send({
          type: 'done',
          subtype: message.subtype,
          cost: message.total_cost_usd ?? null,
          duration: message.duration_ms ?? null,
          sessionId: message.session_id,
          authMode: AUTH_MODE,
        });
      }
    }
  } catch (err) {
    console.error(err);
    send({ type: 'error', text: err.message });
  }
  res.end();
});

// ---------- passo 3: preview da aplicação ----------

const running = new Map(); // projectId -> child process

app.post('/api/preview/:id', (req, res) => {
  const project = getProject(req.params.id);
  if (!project) return res.status(400).json({ error: 'Projeto não encontrado.' });
  if (!project.devCommand || !project.previewUrl) {
    return res.status(400).json({ error: 'Configure devCommand e previewUrl em config/projects.json.' });
  }

  if (running.has(project.id)) {
    return res.json({ url: project.previewUrl, alreadyRunning: true });
  }

  const logDir = path.join(ROOT, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = fs.openSync(path.join(logDir, `${project.id}.log`), 'a');

  const child = spawn(project.devCommand, {
    cwd: project.path,
    shell: true,
    stdio: ['ignore', logFile, logFile],
    detached: false,
  });
  running.set(project.id, child);
  child.on('exit', () => running.delete(project.id));

  // dá alguns segundos para o dev server subir antes de devolver a URL
  setTimeout(() => res.json({ url: project.previewUrl }), 4000);
});

app.post('/api/preview/:id/stop', (req, res) => {
  const child = running.get(req.params.id);
  if (child) child.kill('SIGTERM');
  res.json({ stopped: Boolean(child) });
});

app.listen(PORT, () => {
  console.log(`⚙️  Motor IA rodando em http://localhost:${PORT}`);
  if (AUTH_MODE === 'assinatura') {
    console.log('🔑 Modo assinatura: usando o login do Claude Code (sem cobrança por token).');
    console.log('   Se ainda não fez login, rode: npx @anthropic-ai/claude-code /login');
  } else {
    console.log('🔑 Modo API: usando ANTHROPIC_API_KEY (cobrança por token).');
  }
});
