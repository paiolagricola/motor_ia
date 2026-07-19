# ⚡ Integração Energisa — faturas em aberto + energia injetada

Todo mês, o motor consulta a Agência Digital da Energisa
(servicos.energisa.com.br), baixa as **faturas em aberto** e lê nos PDFs:

- **Valor** e **vencimento** de cada fatura
- **Consumo** do mês (kWh)
- **Energia injetada** pela sua geração solar (kWh) — as linhas "ENERGIA
  INJETADA" da fatura
- **Saldo de créditos** do sistema de compensação (SCEE)

A Energisa **não tem API pública**, então a consulta é feita por um navegador
automatizado (Playwright/Chromium) que entra no portal como você entraria —
com o seu CPF/CNPJ e senha — e baixa os PDFs. Os dados extraídos ficam no seu
computador, em `dados/energisa/`.

## Configurar (uma vez)

1. Tenha cadastro na Agência Digital da Energisa (o mesmo login do site/app).
2. Abra o arquivo `.env` na pasta do motor e preencha:

```
ENERGISA_CPF_CNPJ=00000000000
ENERGISA_SENHA=sua-senha-do-portal
ENERGISA_DIA=5        # dia do mês da consulta automática
```

3. Instale o navegador da consulta (uma vez): `npx playwright install chromium`
   — ou simplesmente dê dois cliques em `energisa.bat` (Windows) /
   `energisa.command` (Mac), que fazem isso sozinhos.

## Consultar

- **Automático:** com o `.env` preenchido, o motor consulta sozinho todo mês
  no dia configurado (a partir das 8h), sempre que o painel estiver ligado.
  Se o computador estiver desligado no dia, roda na primeira vez que o motor
  ligar depois.
- **Manual (dois cliques):** `energisa.bat` (Windows) ou `energisa.command` (Mac).
- **Manual (terminal):** `npm run energisa`
- **Pelo painel:** `POST /api/energisa/consultar` dispara a consulta e
  `GET /api/energisa/historico` devolve o histórico em JSON.

## Onde ficam os resultados

```
dados/energisa/
  historico.json          # todas as faturas já vistas (por UC + mês)
  relatorio-AAAA-MM-DD.md # relatório legível de cada consulta
  faturas/                # PDFs baixados
  sessao.json             # sessão logada (evita repetir login/captcha)
  erros/                  # prints da tela quando algo falha
```

Essa pasta é sua (está no `.gitignore` — senha e faturas nunca vão para o Git).

## Primeiro acesso, CAPTCHA e código de verificação

O portal às vezes pede CAPTCHA ou código por SMS/e-mail — coisas que só um
humano resolve. Nesses casos, rode **uma vez** com a janela visível:

```
npm run energisa -- --visivel
```

Complete o login na janela que abrir. A sessão fica salva em
`dados/energisa/sessao.json` e as consultas seguintes voltam a ser 100%
automáticas, até a sessão expirar (aí é só repetir).

## Se a Energisa mudar o site

Portais mudam de layout sem avisar. Quando isso acontecer:

- A consulta salva um **print da tela** em `dados/energisa/erros/` mostrando
  onde parou.
- Os pontos de ajuste estão centralizados no objeto `SELETORES` em
  `src/energisa/portal.js`.
- Atalho: descreva o problema no painel do Motor IA anexando o print — o
  executor ajusta os seletores para você.

## Conferindo a extração

Se algum número parecer estranho, abra o `historico.json`: cada fatura guarda
em `conferencia` as linhas brutas do PDF de onde os valores saíram (energia
injetada, consumo e saldo), para bater com o papel.
