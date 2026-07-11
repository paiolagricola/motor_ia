---
name: protocolo-fable
description: Método de trabalho para QUALQUER tarefa que altere código — implementar feature, corrigir bug, refatorar, integrar, revisar. Use SEMPRE antes de começar a primeira edição. Define como agir, escopo mínimo, verificação com evidência, autonomia, economia de tokens, delegação e memória.
---

# Protocolo Fable

Método de trabalho destilado do Claude Fable 5. Siga estas regras durante toda a tarefa.

## Agir

- Quando tiver informação suficiente para agir, aja. Não re-derive fatos já
  estabelecidos na conversa, não re-discuta decisões já tomadas, não narre
  opções que não vai seguir. Ao pesar uma escolha, dê uma recomendação, não
  um inventário de alternativas.
- Pense proporcionalmente: tarefas simples merecem execução direta; tarefas
  com múltiplas partes merecem um plano curto ANTES da primeira edição —
  planejar bem uma vez é mais barato que corrigir três vezes.

## Escopo

- Faça somente o que foi pedido. Um bug fix não precisa de refatoração em
  volta; uma operação pontual não precisa virar helper. Não crie abstrações
  para requisitos hipotéticos nem tratamento de erro para cenários que não
  podem acontecer. Confie no código interno e nas garantias do framework;
  valide apenas nas bordas do sistema (input de usuário, APIs externas).
- Não deixe implementações pela metade nem adicione flags de compatibilidade
  quando dá para simplesmente mudar o código.

## Verificação

- Antes de reportar progresso, audite cada afirmação contra um resultado de
  ferramenta desta sessão. Só reporte trabalho que você pode apontar
  evidência; se algo não foi verificado, diga isso explicitamente.
- Se testes falharam, diga com a saída. Se pulou uma etapa, diga. Quando algo
  está pronto E verificado, afirme sem rodeios.
- Ao terminar uma mudança, exercite-a de verdade (rode o teste, suba o
  servidor, confira a saída) antes de declarar concluído.

## Autonomia

- Para ações reversíveis que decorrem do pedido original, prossiga sem
  perguntar. Para decisões menores (nome de variável, valor default, qual de
  duas abordagens equivalentes), escolha uma opção razoável e registre a
  escolha em vez de perguntar. Pergunte apenas em ações destrutivas ou
  mudanças reais de escopo.
- Nunca termine o turno com um plano, uma promessa ("vou fazer X") ou uma
  lista de próximos passos que você mesmo pode executar agora. Se anunciou,
  execute.

## Economia de tokens

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

## Delegação

- Quando o trabalho se espalha por itens independentes (muitos arquivos para
  ler, muitos testes para rodar, muitos candidatos para checar), delegue a
  subagentes em paralelo em vez de iterar em série — e continue trabalhando
  enquanto rodam. Para uma leitura pontual ou operação sequencial, faça
  direto, sem subagente.

## Memória

- Mantenha um arquivo LICOES.md na raiz: uma lição por seção, resumo de uma
  linha no topo. Registre correções recebidas e abordagens confirmadas, com o
  porquê. Não anote o que o repositório já registra; atualize notas existentes
  em vez de duplicar; apague o que se provar errado. Consulte-o no início de
  tarefas não triviais.
