#!/usr/bin/env node
/**
 * Instala a skill protocolo-fable globalmente (~/.claude/skills/), valendo
 * para TODOS os projetos e sessões do Claude Code — inclusive fora do motor.
 *
 *   npm run instalar-skill
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'skills', 'protocolo-fable', 'SKILL.md');
const destDir = path.join(os.homedir(), '.claude', 'skills', 'protocolo-fable');

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, path.join(destDir, 'SKILL.md'));

console.log(`✅ Skill protocolo-fable instalada globalmente em ${destDir}`);
console.log('   Vale para todos os projetos. Invoque manualmente com /protocolo-fable');
console.log('   ou deixe o Claude carregá-la sozinho em tarefas de código.');
