# ⚙️ Motor IA

Motor de orquestração para desenvolver várias aplicações economizando tempo e tokens.

**O fluxo:**

1. **Você descreve** a melhoria em linguagem normal e anexa prints, planilhas ou PDFs.
2. **O estruturador** (modelo barato — Haiku) transforma tudo numa **spec técnica enxuta**: objetivo, mudanças, fora do escopo, critérios de aceite.
3. **Você revisa e aprova** a spec (edita o que quiser antes de gastar tokens do executor).
4. **O Claude Code executa** a spec no repositório do projeto, com acesso ao Supabase e GitHub via MCP.
5. **Você abre a aplicação** com um clique, testa, e volta ao passo 1 para a próxima melhoria.

A economia vem de três lugares: a spec enxuta (o executor não recebe conversa solta nem planilha inteira), o `CLAUDE.md` de cada projeto (o Claude Code não redescobre o projeto a cada sessão) e o cache de prompt automático do Claude Code.

## Começar a usar SEM terminal (jeito fácil)

1. **Instale o Node.js** (uma vez): https://nodejs.org/pt — botão verde (LTS), avançar até o fim.
2. **Baixe o motor:** [clique aqui para baixar o ZIP](https://github.com/paiolagricola/motor_ia/archive/refs/heads/claude/system-emulator-claude-chat-yqgcbe.zip) e **extraia** a pasta (botão direito → Extrair tudo).
3. **Dê dois cliques** no arquivo dentro da pasta:
   - Windows: `instalar.bat`
   - Mac: `instalar.command` (se o Mac bloquear: botão direito → Abrir)

O instalador faz o resto: instala as dependências, te guia no login da sua
assinatura Claude (digite `/login`, siga o navegador, depois `/exit`) e abre o
painel em http://localhost:4000 sozinho. **Nas próximas vezes**, use o
`iniciar.bat` / `iniciar.command` — dois cliques e o painel abre.

## Começar a usar pelo terminal (4 comandos)

```bash
git clone https://github.com/paiolagricola/motor_ia.git && cd motor_ia
npm install
npx @anthropic-ai/claude-code /login    # uma vez — usa sua assinatura Claude
npm start                               # → http://localhost:4000
```

O `npm start` se auto-configura na primeira execução: cria o `.env` (modo
assinatura), cria a lista de projetos e instala a skill **protocolo-fable**
globalmente ([entenda em docs/CLAUDE-FABLE.md](docs/CLAUDE-FABLE.md)). O painel
então te guia para cadastrar o primeiro projeto:

```bash
npm run novo-projeto -- https://github.com/voce/seu-app 3000
```

Depois preencha o `CLAUDE.md` e o `.mcp.json` criados dentro do projeto —
e pronto: descreva a primeira melhoria no painel.

Requisitos: Node.js 18+ e uma conta Claude — assinatura (Pro/Max) **ou** chave da API.

### Autenticação: assinatura ou API?

| Modo | Como ativar | Cobrança |
|---|---|---|
| **Assinatura** (Pro/Max) | Deixe `ANTHROPIC_API_KEY` vazio no `.env` e rode `npx @anthropic-ai/claude-code /login` uma vez | Nenhuma além da mensalidade — usa os limites do seu plano. Os valores em $ no painel são só informativos. |
| **API** | Preencha `ANTHROPIC_API_KEY` no `.env` | Por token usado. O estruturador usa Haiku (centavos); o painel mostra o custo real de cada execução. |

Se você já tem assinatura, use o modo assinatura — é o mais econômico.

## Cadastrando um projeto

O jeito rápido — funciona com caminho local **ou** URL do GitHub (clona sozinho):

```bash
npm run novo-projeto -- /home/voce/repos/meu-app 3000
npm run novo-projeto -- https://github.com/voce/meu-app 3000
```

O script registra o projeto, detecta o comando de dev e cria `CLAUDE.md` e
`.mcp.json` a partir dos templates se o projeto ainda não tiver — só preencher.

Ou edite `config/projects.json` na mão:

```json
{
  "projects": [
    {
      "id": "meu-app",
      "name": "Meu App",
      "path": "/home/voce/repos/meu-app",
      "notes": "Next.js 14 + Supabase. Tela principal em app/page.tsx.",
      "devCommand": "npm run dev",
      "previewUrl": "http://localhost:3000"
    }
  ]
}
```

- `path` — caminho absoluto do repositório local (o Claude Code trabalha aqui).
- `notes` — 1 linha sobre a stack; entra na spec para orientar o estruturador.
- `devCommand` / `previewUrl` — como subir e abrir a aplicação para teste.

## Conectando Supabase e GitHub (por projeto)

Dentro de **cada projeto seu**, crie um `.mcp.json` na raiz (modelo em
`templates/mcp.json.example`) com os servidores MCP do Supabase e do GitHub.
O Claude Code carrega esse arquivo automaticamente e passa a conseguir
consultar tabelas, ler schema, ver PRs e issues durante a execução.

## CLAUDE.md — a maior economia de tokens

Copie `templates/CLAUDE.md.template` para a raiz de cada projeto e preencha.
Sem ele, o Claude Code gasta tokens redescobrindo a estrutura do projeto em
toda execução; com ele, vai direto ao ponto.

## Modelos e custo

| Papel | Modelo padrão | Onde mudar |
|---|---|---|
| Estruturador (pedido → spec) | modo API: `claude-haiku-4-5` · modo assinatura: padrão do plano | `STRUCTURER_MODEL` no `.env` |
| Executor (Claude Code) | padrão do Claude Code | `EXECUTOR_MODEL` no `.env` |

O painel mostra os tokens do estruturador em cada spec e, ao final de cada
execução, o uso em dólares — que no modo assinatura é apenas informativo
(sem cobrança extra).

## Segurança

O executor roda com `permissionMode: acceptEdits` e uma lista de ferramentas
liberadas (incluindo `Bash`) para funcionar sem aprovação interativa — ele
edita arquivos e roda comandos **no repositório do projeto** por conta própria.
Use em repositórios com git (tudo é reversível com `git checkout`/`git reset`)
e revise o diff antes de commitar. Ajuste `allowedTools` em `src/server.js`
se quiser apertar o controle.

## Estrutura

```
src/server.js        # servidor Express: estrutura, executa (Agent SDK) e faz preview
src/structurer.js    # pedido + anexos → spec estruturada (saída JSON validada)
public/index.html    # painel web (pedido → spec → execução)
config/projects.json # seus projetos
templates/           # modelos de CLAUDE.md e .mcp.json para os seus projetos
```
