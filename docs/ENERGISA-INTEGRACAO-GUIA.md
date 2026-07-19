# ⚡ Guia técnico completo — Integração com a Energisa (faturas em aberto + energia injetada)

> Tudo que foi aprendido construindo a integração do Motor IA com a Energisa,
> organizado para ser reaproveitado em **qualquer aplicação web** (Node, Python,
> PHP, etc.). Os conceitos são portáveis; os trechos de código de referência
> estão em JavaScript (Playwright + Node).
>
> Implementação de referência: `src/energisa/` neste repositório
> (`portal.js`, `fatura.js`, `consultar.js`, `agendador.js`).

---

## 1. O fato central: a Energisa NÃO tem API pública

Não existe API REST documentada, nem OAuth, nem webhook. Os canais oficiais são:

| Canal | URL / acesso | Serve para automação? |
|---|---|---|
| **Agência Digital** (portal web) | `https://servicos.energisa.com.br` | ✅ Sim — via navegador automatizado |
| Página de faturas (logado) | `https://servicos.energisa.com.br/faturas` | ✅ Alvo principal do robô |
| Segunda via "simplificada" (sem login) | `https://servicos.energisa.com.br/segunda-via` | ⚠️ Parcial — só pagamento, pede CPF + UC e às vezes código de verificação |
| App Energisa ON / WhatsApp / telefone | — | ❌ Não |

Consequência arquitetural: **a integração é web scraping com navegador real**
(Playwright/Puppeteer/Selenium), não uma chamada HTTP simples. Requisições
`fetch`/`curl` diretas não funcionam porque:

1. O portal é um **SPA** (a página HTML inicial vem vazia; os dados chegam por
   chamadas JSON internas depois do JavaScript rodar).
2. O login gera **cookies/tokens de sessão** que só nascem no fluxo do navegador.
3. Há **CAPTCHA** (reCAPTCHA/hCaptcha) em parte dos fluxos de login.

## 2. Autenticação: como funciona e como sobreviver a ela

### 2.1 Credenciais

- Login com **CPF ou CNPJ + senha** — o mesmo cadastro do site/app.
- No primeiro acesso da conta, o portal pode pedir confirmação por **código via
  SMS/e-mail/WhatsApp** (2FA eventual, não sempre).
- Envie o documento **só com dígitos** (strip de `.`, `-`, `/`): campos com
  máscara aceitam melhor o valor limpo.

### 2.2 A estratégia que torna a automação viável: sessão persistida

O ponto mais importante do design. O login (com seus captchas e códigos) é o
elo frágil — então **faça-o o mínimo possível**:

1. Após um login bem-sucedido, **salve o estado da sessão** (cookies +
   localStorage). No Playwright: `context.storageState({ path: 'sessao.json' })`.
2. Em toda consulta seguinte, **restaure a sessão** antes de navegar:
   `browser.newContext({ storageState: 'sessao.json' })`.
3. Vá **direto** para `/faturas`. Se a sessão ainda vale, você já está dentro —
   sem login, sem captcha. Se expirou, o portal redireciona para o login: aí
   sim refaça o login e re-salve a sessão.

Como detectar "estou logado?": a URL não contém `login`/`entrar` **e** não há
`input[type="password"]` na página.

### 2.3 CAPTCHA e 2FA: o plano "humano uma vez"

Captcha não se resolve headless (e burlar seria contra os termos do serviço).
O padrão que funciona:

- Modo normal: navegador **invisível** (headless).
- Ao detectar captcha/2FA em modo invisível → **abortar com mensagem clara**
  instruindo a rodar uma vez em **modo visível** (`headless: false`).
- Em modo visível: preencher o que der, detectar o captcha e **esperar o humano
  concluir** (ex.: `waitForURL(url => !/login/.test(url), { timeout: 5min })`).
- Sessão salva → volta ao 100% automático até a próxima expiração.

Detecção de captcha (presença de qualquer um):
`iframe[src*="recaptcha"]`, `iframe[src*="hcaptcha"]`, `.g-recaptcha`,
`[class*="captcha" i]`.

### 2.4 Fluxo de login em duas telas

O portal às vezes pede **documento primeiro** e a **senha na tela seguinte**.
Trate os dois casos: preencheu o documento e não há campo de senha → clique em
Entrar/Continuar e espere o campo de senha aparecer.

## 3. Navegação e extração no portal (SPA)

### 3.1 Seletores: centralize e use alternativas em cascata

SPAs mudam de layout sem aviso. Duas defesas:

1. **Todos os seletores num único objeto de configuração**, cada campo com uma
   lista de alternativas tentadas em ordem (name → placeholder → texto do botão):

```js
const SELETORES = {
  campoDocumento: ['input[name="cpfCnpj"]', 'input[name="cpf"]', 'input[name="documento"]',
                   'input[placeholder*="CPF" i]', 'input[placeholder*="CNPJ" i]', 'input[id*="cpf" i]'],
  campoSenha:     ['input[type="password"]'],
  botaoEntrar:    ['button[type="submit"]', 'button:has-text("Entrar")',
                   'button:has-text("Acessar")', 'button:has-text("Continuar")'],
  linkFaturas:    ['a[href*="faturas"]', 'a:has-text("Faturas")', 'a:has-text("2ª via")'],
  baixarFatura:   ['button:has-text("Baixar")', 'a:has-text("Baixar")', 'button:has-text("2ª via")',
                   'a:has-text("2ª via")', 'button[aria-label*="baixar" i]', 'a[href$=".pdf"]'],
};
```

2. **Evidência automática em falha**: quando não encontrar um elemento, salve
   screenshot full-page + HTML da página num diretório `erros/`. É o que
   permite consertar o seletor sem reproduzir o problema ao vivo.

### 3.2 Espera de hidratação

Depois de cada `goto`, o SPA precisa de 2–3s para hidratar antes de os campos
existirem. Use `waitUntil: 'domcontentloaded'` + espera explícita pelos
elementos (não confie em `networkidle` — SPAs com polling nunca ficam idle).

### 3.3 Truque valioso: interceptar as chamadas JSON internas

O SPA busca as faturas em endpoints JSON internos (não documentados, mudam sem
aviso — **não** dependa deles como fonte primária, mas **capture-os**):

```js
page.on('response', async (resp) => {
  if (!(resp.headers()['content-type'] || '').includes('json')) return;
  const body = await resp.json().catch(() => null);
  if (!body) return;
  const texto = JSON.stringify(body);
  if (/fatura|vencimento|referencia/i.test(texto) && /valor|total/i.test(texto)) {
    capturadas.push({ url: resp.url(), body }); // salvar para análise
  }
});
```

Depois de algumas execuções reais, você descobre os endpoints/formatos e pode
promovê-los a atalho (mais rápido que DOM). Até lá, servem de depuração.

### 3.4 Download dos PDFs

- Habilite `acceptDownloads: true` no contexto.
- Clique no botão de baixar **junto** com `page.waitForEvent('download')`
  (Promise.all) — o clique sozinho perde o evento.
- Nem todo botão candidato gera download (alguns abrem detalhes): tolere
  timeouts individuais e siga para o próximo.
- **Múltiplas unidades consumidoras (UCs)**: contas rurais/empresariais têm
  várias UCs; o portal pede para escolher. Itere todas — cada UC tem suas
  próprias faturas.

### 3.5 Por que o PDF é a fonte de verdade

A listagem em tela mostra valor/vencimento/status, mas a **energia injetada** e
o **saldo de créditos** vivem no detalhamento da fatura — ou seja, no PDF.
Baixe sempre o PDF e extraia dele; a tela é só o índice.

## 4. Anatomia da fatura Energisa com geração distribuída (GD)

Conhecimento de domínio essencial para o parser:

### 4.1 Conceitos (SCEE — Sistema de Compensação de Energia Elétrica)

- **Energia injetada**: o excedente da geração solar que entrou na rede da
  distribuidora naquele ciclo. Aparece como **itens negativos** (abatimento).
- **Créditos**: injetou mais do que consumiu → o excedente vira crédito em kWh,
  válido por **60 meses**, usável na própria UC ou em outras UCs do mesmo titular.
- **mUC / oUC**: compensação na **m**esma UC que gerou vs. em **o**utra UC
  (autoconsumo remoto). A mesma fatura pode ter as duas linhas.
- **GD I / GD II**: enquadramentos tarifários (regra antiga vs. Lei 14.300/2022,
  que cobra gradualmente o fio B). Podem coexistir como linhas separadas.
- **Ponta / Fora ponta**: UCs do grupo A (alta tensão) separam por posto
  tarifário — mais linhas de injetada.

### 4.2 Linhas típicas do detalhamento

```
Itens da Fatura                       Unid   Quant      Preço     Valor
CONSUMO                               kWh    2.500,00   0,89      2.225,00
ENERGIA INJETADA GD I - mUC           kWh    1.850,00   0,75     -1.387,50
ENERGIA INJETADA GD I - oUC           kWh      320,00   0,75       -240,00
...
Saldo atual de créditos: 4.320,00 kWh
```

Regras do parser:

- **Injetada total = SOMA de todas as linhas** contendo `INJET` (case-insensitive,
  cobre "INJETADA"/"INJ."). Nunca pegue só a primeira.
- A **quantidade em kWh é o primeiro número após o token `kWh`** na linha
  (o segundo é preço unitário, o terceiro é o valor em R$). Use `Math.abs`
  (linhas de injetada são negativas).
- **Consumo**: linha com `CONSUMO` ou `ENERGIA ELÉTRICA`/`ENERGIA ATIVA FORN`
  que **não** contenha `INJET`.
- **Saldo de créditos**: procurar `saldo (atual|acumulado|de créditos) ... kWh`
  ou `crédito de energia ... kWh` — costuma estar no bloco "Informações do
  Sistema de Compensação"/SCEE, às vezes no verso da fatura.

### 4.3 Campos gerais e seus padrões (regex tolerantes)

| Campo | Padrões que funcionam |
|---|---|
| Referência (mês) | `referênc.../competência/mês\/ano` + `MM/AAAA`; fallback `[A-Z]{3}/\d{4}` (ex. `JUN/2026`) |
| Vencimento | `venc...` + `dd/mm/aaaa` |
| Total | `TOTAL A PAGAR` / `VALOR A PAGAR` + `R$ 9.999,99` |
| Unidade consumidora | `unidade consumidora` / `código do cliente` / `UC` + 4–12 dígitos |

### 4.4 Números em formato brasileiro

Sempre converta `1.234,56` → `1234.56`:

```js
const numeroBr = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
```

### 4.5 Variação entre distribuidoras do grupo

O grupo Energisa opera concessões distintas (MT, MS, TO, PB, SE, RO, AC...).
O layout da fatura varia **um pouco** entre elas (rótulos, posição do bloco
SCEE). Por isso:

- Regex **tolerantes** (aceitar `referência`, `referente`, `competência`...).
- **Guardar as linhas brutas** de onde cada valor saiu (campo `conferencia` no
  resultado) — permite auditar a extração sem reabrir o PDF e ajustar o parser
  quando um layout novo aparecer.

### 4.6 Extração do texto do PDF

- Faturas Energisa são PDFs **com camada de texto** (gerados digitalmente) —
  extração direta funciona, **não precisa de OCR**.
- Node: `pdf-parse` (atenção: a **v2** mudou a API — `new PDFParse({ data })` +
  `await parser.getText()`; a v1 era `pdfParse(buffer)`).
- Python: `pdfplumber` ou `PyMuPDF` dão o mesmo resultado.
- Processe **linha a linha** (`text.split('\n')`) — a estrutura tabular da
  fatura vira linhas de texto onde a ordem das colunas se mantém.

## 5. Modelo de dados sugerido

O que a extração devolve por fatura (testado e funcionando):

```json
{
  "unidadeConsumidora": "1234567",
  "referencia": "06/2026",
  "vencimento": "15/07/2026",
  "valorTotal": 1234.56,
  "consumoKwh": 2500,
  "energiaInjetadaKwh": 2170,
  "saldoCreditosKwh": 4320,
  "arquivo": "faturas/fatura-062026.pdf",
  "conferencia": {
    "injetada": ["ENERGIA INJETADA GD I - mUC kWh 1.850,00 0,75 -1.387,50",
                 "ENERGIA INJETADA GD I - oUC kWh 320,00 0,75 -240,00"],
    "consumo":  ["CONSUMO kWh 2.500,00 0,89 2.225,00"],
    "saldo":    ["Saldo atual de creditos: 4.320,00 kWh"]
  }
}
```

Para o histórico, a **chave natural é `UC + referência`** (mês): reconsultar o
mesmo mês deve **atualizar** o registro (upsert), não duplicar. Guarde também
um log de consultas (`quando`, `quantas faturas`) para auditoria.

## 6. Agendamento mensal

Duas lições práticas:

1. **Cron ingênuo perde execuções**: se o processo estiver desligado no
   momento exato, o mês passa em branco. Modele como *"rodar a partir do dia D,
   na primeira oportunidade, no máximo 1× por mês"*:

```js
// verificação horária; dispara quando (dia >= D && hora >= 8 && ainda não rodou este mês)
let ultimoMes = null;
setInterval(() => {
  const agora = new Date(), mes = `${agora.getFullYear()}-${agora.getMonth()}`;
  if (agora.getDate() >= DIA && agora.getHours() >= 8 && ultimoMes !== mes) {
    ultimoMes = mes;
    consultar().catch(logar);
  }
}, 60 * 60 * 1000);
```

   (Numa aplicação web com banco, persista `ultimoMes` no banco em vez de
   memória, para sobreviver a restarts.)

2. **Trava de concorrência**: consulta dispara navegador e demora minutos.
   Nunca permita duas simultâneas (uma flag/promise em andamento; o endpoint
   manual responde `409` se já houver consulta rodando).

Dia sugerido: entre 1 e 28 (evita o problema de fevereiro). As faturas fecham
em dias diferentes por UC — um dia fixo por mês pega "o que estiver em aberto".

## 7. Expondo na sua aplicação web

Endpoints mínimos (o que foi implementado aqui):

| Método | Rota | Faz |
|---|---|---|
| `GET` | `/api/energisa/historico` | Devolve o JSON acumulado (todas as faturas por UC+mês) |
| `POST` | `/api/energisa/consultar` | Dispara a consulta agora; `409` se já houver uma em andamento |

Recomendações para web app multiusuário:

- A consulta é **lenta** (30s–3min): rode em **job/fila em background**
  (BullMQ, Celery, cron worker) e nunca no request HTTP; o endpoint só enfileira
  e devolve um id de job.
- O navegador headless consome ~200–400 MB de RAM por instância: **serialize**
  as consultas (fila com concorrência 1) em servidores pequenos.
- Em produção Docker: use a imagem `mcr.microsoft.com/playwright` (já traz o
  Chromium e as libs de sistema).

## 8. Segurança (não pule esta parte)

- A senha da Energisa dá acesso à conta inteira do cliente. **Nunca** no código
  ou no Git: variável de ambiente / secret manager; se for multiusuário,
  criptografe em repouso (ex.: AES-GCM com chave fora do banco).
- O `sessao.json` (cookies) **equivale à senha** enquanto a sessão vale —
  mesma proteção.
- PDFs de fatura contêm nome, endereço e CPF/CNPJ — trate como dado pessoal
  (LGPD): acesso restrito, retenção definida.
- Coloque `dados/` (PDFs, sessão, histórico) no `.gitignore`.
- Automação com as credenciais do próprio titular, para uso do próprio titular,
  em ritmo humano (1×/mês) — sem burlar captcha, sem força bruta, com
  identificação normal de navegador.

## 9. Modos de falha conhecidos e como o design responde

| Falha | Resposta do design |
|---|---|
| Portal mudou o layout | Seletores centralizados + screenshot/HTML salvos em `erros/` no ponto da falha |
| Captcha em modo headless | Erro com instrução explícita: rodar 1× `--visivel`, sessão fica salva |
| Pediu código SMS/e-mail | Mesmo tratamento do captcha (modo visível, humano conclui) |
| Sessão expirou | Detectado por redirect ao login → refaz login → re-salva sessão |
| Senha errada / login não avança | Timeout de 30s no pós-login → erro com screenshot |
| Botão que não baixa PDF | Timeout individual por botão; segue para o próximo |
| Nenhuma fatura em aberto | Não é erro: relatório registra "nenhuma fatura" (mas salva print, pois pode ser layout novo) |
| PDF ilegível | Registra `erroLeitura` no histórico sem derrubar o lote |
| Duas consultas ao mesmo tempo | Trava de concorrência (`409` no endpoint) |
| Campo extraído suspeito | Linhas brutas em `conferencia` para auditoria |

## 10. Checklist para portar para a sua aplicação

1. ☐ Navegador automatizado (Playwright recomendado) + Chromium instalado
2. ☐ Config: CPF/CNPJ, senha, dia da consulta (env vars/secrets)
3. ☐ Login em `servicos.energisa.com.br` com sessão persistida (storageState)
4. ☐ Detecção de captcha/2FA + modo visível de contingência
5. ☐ Ir a `/faturas`, iterar UCs, baixar PDFs em aberto (waitForEvent download)
6. ☐ Parser de PDF: linhas `INJET` somadas, consumo, total, vencimento, saldo SCEE, números BR
7. ☐ Histórico com upsert por `UC + referência` + linhas brutas de conferência
8. ☐ Agendador "primeira oportunidade do mês" + trava de concorrência
9. ☐ Job em background (não no request) + screenshots de erro
10. ☐ Segurança: secrets fora do código, sessão protegida, `dados/` fora do Git

## 11. Referências

- Implementação de referência: `src/energisa/` neste repositório
- [Agência Digital — Energisa](https://servicos.energisa.com.br/)
- [Segunda via de fatura — Energisa](https://www.energisa.com.br/segunda-via-de-fatura)
- [Central de Ajuda — como acessar faturas](https://ajuda.energisa.com.br/pergunta/saiba-como-acessar-as-suas-faturas/)
- [Geração Distribuída — Energisa](https://www.energisa.com.br/para-sua-casa/servicos/outros-servicos/geracao-distribuida)
- [Way2 — como a energia injetada aparece na fatura](https://way2.com.br/fatura-de-energia-na-geracao-distribuida/)
- Lei 14.300/2022 (marco legal da micro/minigeração distribuída — regras GD I/GD II)
