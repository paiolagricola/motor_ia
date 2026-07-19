// Agendamento mensal da consulta Energisa dentro do próprio servidor do
// Motor IA: enquanto o painel estiver rodando, a consulta acontece sozinha
// todo mês no dia configurado (ENERGISA_DIA, padrão dia 5, às 08h).

import { consultarEnergisa } from './consultar.js';

export function agendarConsultaMensal() {
  if (!process.env.ENERGISA_CPF_CNPJ || !process.env.ENERGISA_SENHA) return null;

  const dia = Math.min(28, Math.max(1, parseInt(process.env.ENERGISA_DIA || '5', 10) || 5));

  let executando = false;
  const rodar = async () => {
    if (executando) return;
    executando = true;
    try {
      await consultarEnergisa();
    } catch (err) {
      console.error(`⚡ Energisa: consulta automática falhou — ${err.message}`);
    } finally {
      executando = false;
    }
  };

  // Verificação leve de hora em hora: dispara quando chega o dia/hora e ainda
  // não rodou neste mês (robusto a computador desligado no horário exato —
  // roda na primeira oportunidade a partir do dia configurado).
  let ultimoMesExecutado = null;
  const tick = () => {
    const agora = new Date();
    const mes = `${agora.getFullYear()}-${agora.getMonth()}`;
    if (agora.getDate() >= dia && agora.getHours() >= 8 && ultimoMesExecutado !== mes) {
      ultimoMesExecutado = mes;
      rodar();
    }
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref?.();
  tick();

  console.log(`⚡ Energisa: consulta mensal agendada para o dia ${dia} (ou na primeira vez que o motor estiver ligado depois disso).`);
  return timer;
}
