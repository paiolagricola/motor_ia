---
name: motor-ia
description: Fluxo do Motor IA para este projeto. Use SEMPRE que o usuário descrever uma melhoria, ajuste, correção ou nova funcionalidade em linguagem natural — com ou sem prints, planilhas ou PDFs anexados. Estrutura o pedido em spec enxuta, pede aprovação ANTES de implementar, executa, verifica com evidência e entrega resumo com instruções de teste.
---

# Motor IA — fluxo de melhoria

Quando o usuário descrever uma melhoria, siga estas 5 etapas, nesta ordem.

## 1. Estruturar a spec

Do pedido e dos anexos, monte e apresente ao usuário uma spec neste formato:

- **Título** — curto, máx. 10 palavras
- **Objetivo** — o que o usuário quer alcançar, em 1–2 frases
- **Contexto** — só o essencial dos anexos: de planilhas, extraia números de
  referência e estrutura (nunca copie as linhas); de prints, descreva o que
  importa para a mudança
- **Mudanças** — lista numerada, cada item acionável ("Adicionar filtro X na
  tela Y"), nunca vago
- **Fora do escopo** — o que explicitamente NÃO será feito nesta rodada
- **Critérios de aceite** — condições verificáveis de "pronto"
- **Perguntas abertas** — ambiguidades que o usuário precisa resolver

Não invente requisitos que o usuário não pediu. Se o pedido for ambíguo,
registre em perguntas abertas em vez de adivinhar.

## 2. Aguardar aprovação

Apresente a spec e PARE — não implemente antes de o usuário aprovar ou
responder as perguntas abertas. Ajuste a spec se ele pedir mudanças.

## 3. Executar

- Siga a skill `protocolo-fable` durante toda a implementação (se disponível).
- Implemente somente o que está na spec. Fora do escopo é proibido.

## 4. Verificar

- Rode o build e os testes do projeto, se existirem.
- Exercite a mudança de verdade quando possível (rodar o servidor, chamar o
  endpoint, conferir a saída).
- Confirme cada critério de aceite com evidência de ferramenta — nunca
  declare "pronto" sem verificar.

## 5. Entregar

- Commit com mensagem clara do que mudou e por quê; push.
- Resumo final para o usuário: o que mudou (primeira frase), evidência da
  verificação, e **como testar** — incluindo o link de preview/deploy se o
  projeto tiver (Vercel, Netlify etc.).
- Termine perguntando se ele quer a próxima melhoria — o ciclo recomeça.
