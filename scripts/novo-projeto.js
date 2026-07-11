#!/usr/bin/env node
/**
 * Cadastra um projeto no Motor IA:
 *
 *   npm run novo-projeto -- <caminho-local | url-do-github> [porta-do-dev-server]
 *
 * Exemplos:
 *   npm run novo-projeto -- /home/voce/repos/meu-app 3000
 *   npm run novo-projeto -- https://github.com/voce/meu-app 3000
 *
 * O que ele faz:
 *   1. Clona o repositório (se for URL) para ./projetos/<nome>
 *   2. Adiciona a entrada em config/projects.json
 *   3. Semeia CLAUDE.md e .mcp.json a partir de templates/ (se não existirem)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , target, porta] = process.argv;

if (!target) {
  console.error('Uso: npm run novo-projeto -- <caminho-local | url-do-github> [porta]');
  process.exit(1);
}

// 1. resolve o caminho do projeto (clonando se for URL)
let projectPath;
let name;
if (/^(https?:\/\/|git@)/.test(target)) {
  name = target.replace(/\.git$/, '').split('/').pop();
  const dest = path.join(ROOT, 'projetos', name);
  if (fs.existsSync(dest)) {
    console.log(`Repositório já clonado em ${dest} — usando o existente.`);
  } else {
    console.log(`Clonando ${target} → ${dest} ...`);
    fs.mkdirSync(path.join(ROOT, 'projetos'), { recursive: true });
    execSync(`git clone ${JSON.stringify(target)} ${JSON.stringify(dest)}`, { stdio: 'inherit' });
  }
  projectPath = dest;
} else {
  projectPath = path.resolve(target);
  if (!fs.existsSync(projectPath)) {
    console.error(`Caminho não existe: ${projectPath}`);
    process.exit(1);
  }
  name = path.basename(projectPath);
}

// 2. detecta o comando de dev pelo package.json (se houver)
let devCommand = '';
const pkgPath = path.join(projectPath, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.scripts?.dev) devCommand = 'npm run dev';
  else if (pkg.scripts?.start) devCommand = 'npm start';
}

// 3. adiciona ao config/projects.json
const configPath = path.join(ROOT, 'config', 'projects.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : { projects: [] };

const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
if (config.projects.some((p) => p.id === id)) {
  console.log(`Projeto "${id}" já está cadastrado em config/projects.json.`);
} else {
  config.projects.push({
    id,
    name,
    path: projectPath,
    notes: 'PREENCHA: stack e onde ficam as telas principais (1 linha).',
    devCommand: devCommand || 'PREENCHA: comando para subir em dev',
    previewUrl: porta ? `http://localhost:${porta}` : 'PREENCHA: http://localhost:PORTA',
  });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`✅ Projeto "${id}" adicionado a config/projects.json`);
}

// 4. semeia CLAUDE.md e .mcp.json se o projeto ainda não tiver
const seeds = [
  ['CLAUDE.md.template', 'CLAUDE.md'],
  ['mcp.json.example', '.mcp.json'],
];
for (const [tpl, dest] of seeds) {
  const destPath = path.join(projectPath, dest);
  if (fs.existsSync(destPath)) {
    console.log(`• ${dest} já existe no projeto — mantido.`);
  } else {
    fs.copyFileSync(path.join(ROOT, 'templates', tpl), destPath);
    console.log(`✅ ${dest} criado no projeto (a partir do template) — PREENCHA antes da primeira execução.`);
  }
}

// 5. instala a skill protocolo-fable no projeto (.claude/skills/)
const skillSrc = path.join(ROOT, 'skills', 'protocolo-fable', 'SKILL.md');
const skillDestDir = path.join(projectPath, '.claude', 'skills', 'protocolo-fable');
if (fs.existsSync(path.join(skillDestDir, 'SKILL.md'))) {
  console.log('• skill protocolo-fable já existe no projeto — mantida.');
} else {
  fs.mkdirSync(skillDestDir, { recursive: true });
  fs.copyFileSync(skillSrc, path.join(skillDestDir, 'SKILL.md'));
  console.log('✅ skill protocolo-fable instalada em .claude/skills/ (método de trabalho do Fable 5).');
}

console.log(`
Próximos passos:
  1. Edite ${path.join(projectPath, 'CLAUDE.md')} (stack, estrutura, comandos, cuidados)
  2. Edite ${path.join(projectPath, '.mcp.json')} (credenciais do Supabase/GitHub) — ou apague se não usar
  3. Revise a entrada em config/projects.json (campos marcados com PREENCHA)
  4. npm start  →  http://localhost:${process.env.PORT || 4000}
`);
