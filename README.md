# ⚙️ Motor IA

Motor de orquestração para desenvolver várias aplicações economizando tempo e tokens.

**O fluxo:**

1. **Você descreve** a melhoria em linguagem normal e anexa prints, planilhas ou PDFs.
2. **O estruturador** (modelo barato — Haiku) transforma tudo numa **spec técnica enxuta**: objetivo, mudanças, fora do escopo, critérios de aceite.
3. **Você revisa e aprova** a spec (edita o que quiser antes de gastar tokens do executor).
4. **O Claude Code executa** a spec no repositório do projeto, com acesso ao Supabase e GitHub via MCP.
5. **Você abre a aplicação** com um clique, testa, e volta ao passo 1 para a próxima melhoria.

A economia vem de três lugares: a spec enxuta (o executor não recebe conversa solta nem planilha inteira), o `CLAUDE.md` de cada projeto (o Claude Code não redescobre o projeto a cada sessão) e o cache de prompt automático do Claude Code.

## Instalação

```bash
npm install
cp .env.example .env        # preencha a ANTHROPIC_API_KEY
cp config/projects.example.json config/projects.json   # cadastre seus projetos
npm start                   # abre em http://localhost:4000
```

Requisitos: Node.js 18+ e uma chave da API da Anthropic (https://console.anthropic.com).

## Cadastrando um projeto

Edite `config/projects.json`:

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
| Estruturador (pedido → spec) | `claude-haiku-4-5` (barato) | `STRUCTURER_MODEL` no `.env` |
| Executor (Claude Code) | padrão do Claude Code | `EXECUTOR_MODEL` no `.env` |

O painel mostra os tokens do estruturador em cada spec e o custo em dólares
de cada execução ao final.

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
