'use strict';

const ATIVOS = Object.freeze(['USD', 'EUR', 'BTC']);
const ENDPOINT = 'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL';

function falhaDaFonte(mensagem, status = 502) {
  return Object.assign(new Error(mensagem), { status });
}

// Preservar a representação decimal do preço permite fazer as contas sem ponto flutuante.
function precoValido(valor) {
  return typeof valor === 'string' && /^\d{1,12}(\.\d{1,12})?$/.test(valor) && Number(valor) > 0;
}

// Ambos os preços são validados com até 12 casas. Igualar a escala preserva
// a ordem mesmo se os valores diferirem apenas no último dígito decimal.
function precoEmTrilionesimos(valor) {
  const [inteira, fracao = ''] = valor.split('.');
  return BigInt(inteira + fracao.padEnd(12, '0'));
}

function normalizarCotacoes(dados) {
  const cotacoes = {};
  for (const ativo of ATIVOS) {
    const item = dados?.[ativo + 'BRL'];
    if (item?.code !== ativo || item.codein !== 'BRL' ||
        !precoValido(item.bid) || !precoValido(item.ask) || precoEmTrilionesimos(item.ask) < precoEmTrilionesimos(item.bid)) {
      throw falhaDaFonte('Preços inválidos ou ausentes para ' + ativo + '/BRL.');
    }
    // O timestamp da fonte está em segundos. Não substituímos a data por uma data local.
    const segundos = typeof item.timestamp === 'number' || /^\d{1,12}$/.test(
      typeof item.timestamp === 'string' ? item.timestamp : ''
    ) ? Number(item.timestamp) : NaN;
    const data = new Date(segundos * 1000);
    if (!Number.isSafeInteger(segundos) || segundos <= 0 || !Number.isFinite(data.getTime())) {
      throw falhaDaFonte('Data da cotação inválida para ' + ativo + '/BRL.');
    }
    const variacao = typeof item.pctChange === 'string' && item.pctChange.trim()
      ? Number(item.pctChange) : NaN;
    cotacoes[ativo] = { bid: item.bid, ask: item.ask, data: data.toISOString(),
      variacao: Number.isFinite(variacao) ? variacao : null };
  }
  return cotacoes;
}

// Em produção sempre consulta a AwesomeAPI. A injeção da função fetch permite testar falhas.
async function buscarCotacoes(fetchImpl = fetch, timeoutMs = 12000) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const resposta = await fetchImpl(ENDPOINT, { signal, headers: { Accept: 'application/json' } });
    if (!resposta.ok) throw falhaDaFonte('AwesomeAPI indisponível (HTTP ' + resposta.status + ').');
    return normalizarCotacoes(await resposta.json());
  } catch (erro) {
    if (signal.aborted || erro.name === 'TimeoutError') {
      throw falhaDaFonte('Tempo de espera pela AwesomeAPI esgotado.', 504);
    }
    if (erro.status === 502) throw erro;
    throw falhaDaFonte('Não foi possível obter cotações válidas da AwesomeAPI.');
  }
}

module.exports = { ATIVOS, buscarCotacoes, precoValido };
