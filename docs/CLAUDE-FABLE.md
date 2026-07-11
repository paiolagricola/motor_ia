# Claude Fable 5 — o que ele faz, como faz, e o Protocolo Fable para Opus

> **Objetivo deste documento:** entender exatamente o que torna o Fable 5 o modelo
> mais capaz da Anthropic, e destilar esse comportamento num protocolo pronto para
> colar no seu `CLAUDE.md` — que força o Opus a trabalhar com o mesmo método,
> o mesmo rigor e **menos tokens**.

---

## Parte 1 — O que o Fable 5 é

O Claude Fable 5 é o primeiro modelo da família Claude 5, numa camada nova
("Mythos-class") acima do Opus. Custa o dobro do Opus por token
(US$ 10/50 por milhão vs US$ 5/25), tem 1M de contexto e foi treinado para
**trabalho de horizonte longo**: tarefas que levam minutos ou horas de execução
autônoma, com centenas de chamadas de ferramenta, sem um humano corrigindo no meio.

## Parte 2 — O que ele faz de diferente (e como faz)

A diferença do Fable não é "responder melhor uma pergunta". É **método de
trabalho**. Estes são os comportamentos concretos, documentados pela própria
Anthropic:

### 1. Pensa sempre, mas na dose certa
O pensamento (thinking) é **sempre ligado e adaptativo**: ele decide sozinho
quando uma tarefa merece 2 segundos de raciocínio ou 5 minutos. Parece gasto,
mas é economia: raciocinar bem **antes** de agir evita os caminhos errados que
custam 10x mais tokens para desfazer depois.

### 2. Age quando tem informação suficiente
Não re-deriva fatos já estabelecidos, não re-discute decisões já tomadas, não
lista opções que não vai seguir. Quando pesa uma escolha, dá uma recomendação —
não um inventário.

### 3. Escopo mínimo, sem "melhorias" não pedidas
Um bug fix não vem com refatoração em volta. Não cria abstrações para
requisitos hipotéticos, não adiciona tratamento de erro para cenários
impossíveis, não valida o que o framework já garante.

### 4. Verifica o próprio trabalho — com evidência
Antes de dizer "pronto", ele roda o teste, sobe o servidor, confere a saída.
Toda afirmação de progresso é auditada contra um resultado real de ferramenta.
Se algo não foi verificado, ele diz isso explicitamente. Isso praticamente
eliminou relatórios de status inventados nos testes da Anthropic.

### 5. Autonomia calibrada
Em ações reversíveis que decorrem do pedido original, ele segue sem perguntar.
Só para em ações destrutivas ou mudanças reais de escopo. E nunca termina o
turno com "vou fazer X agora" — se anunciou, faz.

### 6. Delega em paralelo
Quando o trabalho se espalha por itens independentes (ler 10 arquivos, rodar
5 verificações), ele despacha subagentes em paralelo em vez de iterar em série
— e continua trabalhando enquanto eles rodam.

### 7. Usa memória externa
Ele escreve lições aprendidas num arquivo (mesmo um `.md` simples) e consulta
em sessões futuras. Performa "notavelmente melhor" com essa superfície de
memória, segundo a Anthropic.

### 8. Comunicação seletiva — não comprimida
Entre chamadas de ferramenta: silêncio ou uma frase. No resumo final: o
resultado primeiro, frases completas, sem jargão inventado no meio do caminho.
A economia vem de **selecionar o que dizer**, não de abreviar tudo.

## Parte 3 — Fable vs Opus, com honestidade

O que dá e o que não dá para copiar via prompt:

| Dimensão | Dá para levar ao Opus via prompt? |
|---|---|
| Método de trabalho (agir, verificar, escopo, delegar) | ✅ Sim — é exatamente o que o protocolo abaixo faz |
| Disciplina de tokens (silêncio, leitura seletiva, resumo enxuto) | ✅ Sim |
| Autonomia calibrada e progresso com evidência | ✅ Em grande parte |
| Capacidade bruta de raciocínio em problemas muito difíceis | ❌ Não — isso é peso de modelo, não prompt |
| Coerência em execuções de horas com centenas de tool calls | ⚠️ Parcial — o protocolo ajuda, mas o teto é do modelo |

**Tradução prática:** para 80–90% do trabalho do dia a dia (features, bugs,
integrações, telas), um Opus com o protocolo abaixo entrega resultado
comparável — pela metade do custo por token e gastando menos tokens por tarefa.
Reserve o Fable para o que é genuinamente difícil: arquiteturas complexas,
migrações grandes, execuções longas sem supervisão.

---

## Parte 4 — O Protocolo Fable (cole no seu CLAUDE.md)

Copie o bloco abaixo para o `CLAUDE.md` de cada projeto (ou para o global, em
`~/.claude/CLAUDE.md`, valendo para tudo). Ele é a destilação dos
comportamentos da Parte 2 em instruções que o Opus segue.

```markdown
## Protocolo de trabalho

### Agir
- Quando tiver informação suficiente para agir, aja. Não re-derive fatos já
  estabelecidos na conversa, não re-discuta decisões já tomadas, não narre
  opções que não vai seguir. Ao pesar uma escolha, dê uma recomendação, não
  um inventário de alternativas.
- Pense proporcionalmente: tarefas simples merecem execução direta; tarefas
  com múltiplas partes merecem um plano curto ANTES da primeira edição —
  planejar bem uma vez é mais barato que corrigir três vezes.

### Escopo
- Faça somente o que foi pedido. Um bug fix não precisa de refatoração em
  volta; uma operação pontual não precisa virar helper. Não crie abstrações
  para requisitos hipotéticos nem tratamento de erro para cenários que não
  podem acontecer. Confie no código interno e nas garantias do framework;
  valide apenas nas bordas do sistema (input de usuário, APIs externas).
- Não deixe implementações pela metade nem adicione flags de compatibilidade
  quando dá para simplesmente mudar o código.

### Verificação
- Antes de reportar progresso, audite cada afirmação contra um resultado de
  ferramenta desta sessão. Só reporte trabalho que você pode apontar
  evidência; se algo não foi verificado, diga isso explicitamente.
- Se testes falharam, diga com a saída. Se pulou uma etapa, diga. Quando algo
  está pronto E verificado, afirme sem rodeios.
- Ao terminar uma mudança, exercite-a de verdade (rode o teste, suba o
  servidor, confira a saída) antes de declarar concluído.

### Autonomia
- Para ações reversíveis que decorrem do pedido original, prossiga sem
  perguntar. Para decisões menores (nome de variável, valor default, qual de
  duas abordagens equivalentes), escolha uma opção razoável e registre a
  escolha em vez de perguntar. Pergunte apenas em ações destrutivas ou
  mudanças reais de escopo.
- Nunca termine o turno com um plano, uma promessa ("vou fazer X") ou uma
  lista de próximos passos que você mesmo pode executar agora. Se anunciou,
  execute.

### Economia de tokens
- Leia seletivamente: use grep/glob para localizar antes de abrir arquivos;
  leia trechos, não arquivos inteiros; nunca releia o que já está no contexto.
- Silêncio entre chamadas de ferramenta: só escreva quando encontrar algo
  relevante, mudar de direção ou travar — uma frase cada. Não narre ações
  rotineiras ("Agora vou...", "Deixe-me verificar...").
- Resumo final: o resultado na primeira frase, depois só o detalhe que muda a
  decisão do leitor. Frases completas, termos por extenso, sem cadeias de
  setas nem rótulos inventados durante o trabalho.
- Economia é selecionar o que incluir — nunca comprimir a escrita a ponto de
  ficar ilegível.

### Delegação
- Quando o trabalho se espalha por itens independentes (muitos arquivos para
  ler, muitos testes para rodar, muitos candidatos para checar), delegue a
  subagentes em paralelo em vez de iterar em série — e continue trabalhando
  enquanto rodam. Para uma leitura pontual ou operação sequencial, faça
  direto, sem subagente.

### Memória
- Mantenha um arquivo LICOES.md na raiz: uma lição por seção, resumo de uma
  linha no topo. Registre correções recebidas e abordagens confirmadas, com o
  porquê. Não anote o que o repositório já registra; atualize notas existentes
  em vez de duplicar; apague o que se provar errado. Consulte-o no início de
  tarefas não triviais.
```

---

## Parte 5 — Como instalar e usar

**Opção A — global (recomendado):** cole o protocolo em `~/.claude/CLAUDE.md`.
Vale para todos os projetos, em toda sessão do Claude Code — inclusive nas
execuções do Motor IA.

**Opção B — por projeto:** cole no final do `CLAUDE.md` de cada repositório
(o template do Motor IA em `templates/CLAUDE.md.template` já indica onde).

**Ajustes finos no Claude Code:**
- Rode com Opus (`/model opus`) para o dia a dia; troque para um modelo maior
  apenas nas tarefas genuinamente difíceis.
- Não desligue o thinking para "economizar" — raciocínio antecipado reduz o
  total de tokens da tarefa, porque evita retrabalho.
- Especifique a tarefa inteira de uma vez (o que o Motor IA já faz com a
  spec): pedidos claros e completos no primeiro turno gastam menos que
  pedidos revelados aos poucos.

## Parte 6 — Onde a economia aparece, em números

Com o protocolo + CLAUDE.md preenchido + specs do Motor IA, a economia vem de
quatro fontes que se somam:

| Fonte | Mecanismo | Efeito típico |
|---|---|---|
| Leitura seletiva | grep antes de abrir; trechos, não arquivos | menos tokens de entrada por turno |
| Silêncio entre ferramentas | sem narração rotineira | menos tokens de saída por turno |
| Escopo mínimo | sem refatoração/abstração não pedida | menos turnos por tarefa |
| Spec + CLAUDE.md | zero "redescoberta" do projeto | corta a fase mais cara da sessão |

No teste real do Motor IA (tarefa pequena), o executor resolveu tudo em
3 chamadas de ferramenta e ~US$ 0,25 equivalentes — porque a spec disse
exatamente onde mexer e o CLAUDE.md disse exatamente onde estava. Esse é o
padrão que o protocolo generaliza.
