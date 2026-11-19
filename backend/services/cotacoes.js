'use strict';

// ==========================================================================
// COTAÇÕES DA AWESOMEAPI
// O servidor consulta os preços de USD, EUR e BTC em reais na AwesomeAPI e confere a
// resposta antes de usá-la. O painel recebe esses preços pela rota GET /api/cotacoes,
// e as simulações usam os mesmos valores. Preço inválido nunca vira operação.
// ==========================================================================
const ATIVOS = Object.freeze(['USD', 'EUR', 'BTC']);
const ENDPOINT = 'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL';

// Por quanto tempo a última consulta válida é reaproveitada (30 segundos).
// Sem chave, a própria AwesomeAPI devolve a mesma resposta durante 1 minuto (cache dela)
// e limita o número de consultas por endereço. Repetir a consulta a cada prévia
// gastaria esse limite (resposta HTTP 429) sem trazer um preço mais novo.
const VALIDADE_MS = 30_000;

/** Cria um erro de fonte externa: 502 (resposta ruim) ou 504 (tempo esgotado). */
function falhaDaFonte(mensagem, status = 502) {
  return Object.assign(new Error(mensagem), { status });
}

// Preservar a representação decimal do preço permite fazer as contas sem ponto flutuante.
// Aceita texto com até 12 dígitos inteiros e 12 decimais, maior que zero (ex.: "5.4321").
function precoValido(valor) {
  return typeof valor === 'string' && /^\d{1,12}(\.\d{1,12})?$/.test(valor) && Number(valor) > 0;
}

// Ambos os preços são validados com até 12 casas. Igualar a escala preserva
// a ordem mesmo se os valores diferirem apenas no último dígito decimal.
function precoEmTrilionesimos(valor) {
  const [inteira, fracao = ''] = valor.split('.');
  return BigInt(inteira + fracao.padEnd(12, '0'));
}

/**
 * Confere e simplifica o JSON da AwesomeAPI.
 * Para cada par (USDBRL, EURBRL, BTCBRL) exige código, bid (preço de compra),
 * ask (preço de venda, nunca menor que o bid) e timestamp (horário em segundos).
 * @param {object} dados JSON recebido da fonte.
 * @returns {object} { USD: { bid, ask, data, variacao }, EUR: {...}, BTC: {...} }
 * @throws {Error} 502 se qualquer par estiver ausente ou inválido.
 */
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
    // A variação percentual do dia é opcional; sem ela o painel mostra um traço.
    const variacao = typeof item.pctChange === 'string' && item.pctChange.trim()
      ? Number(item.pctChange) : NaN;
    cotacoes[ativo] = { bid: item.bid, ask: item.ask, data: data.toISOString(),
      variacao: Number.isFinite(variacao) ? variacao : null };
  }
  return cotacoes;
}

/**
 * Consulta a AwesomeAPI com Fetch. Em produção sempre consulta a fonte real;
 * os testes passam uma função fetch falsa para simular falhas.
 * @param {Function} fetchImpl Função usada para a requisição (padrão: fetch do Node).
 * @param {number} timeoutMs Tempo máximo de espera (12 s).
 * @param {string} chave Chave opcional da AwesomeAPI (AWESOMEAPI_KEY no .env).
 * @returns {Promise<object>} Cotações normalizadas.
 * @throws {Error} 502 (fonte recusou, falhou ou respondeu dados ruins) ou 504 (demorou demais).
 */
async function buscarCotacoes(fetchImpl = fetch, timeoutMs = 12000, chave = process.env.AWESOMEAPI_KEY) {
  // AbortSignal.timeout cancela a requisição automaticamente se passar do tempo.
  const signal = AbortSignal.timeout(timeoutMs);
  const headers = { Accept: 'application/json' };
  // Com chave, a AwesomeAPI oferece cota própria. Ela vai no cabeçalho, e não na URL,
  // para não aparecer em registros de acesso.
  if (typeof chave === 'string' && chave.trim()) headers['x-api-key'] = chave.trim();
  try {
    const resposta = await fetchImpl(ENDPOINT, { signal, headers });
    // 429 = a fonte recusou por excesso de consultas vindas deste endereço.
    if (resposta.status === 429) {
      throw falhaDaFonte('A AwesomeAPI recusou a consulta por limite de uso (HTTP 429). Aguarde alguns minutos e tente novamente.');
    }
    if (!resposta.ok) throw falhaDaFonte('AwesomeAPI indisponível (HTTP ' + resposta.status + ').');
    return normalizarCotacoes(await resposta.json());
  } catch (erro) {
    if (signal.aborted || erro.name === 'TimeoutError') {
      throw falhaDaFonte('Tempo de espera pela AwesomeAPI esgotado.', 504);
    }
    if (erro.status === 502) throw erro;
    // Sem internet, DNS falhando ou JSON quebrado: mensagem pública e genérica.
    throw falhaDaFonte('Não foi possível obter cotações válidas da AwesomeAPI.');
  }
}

/**
 * Envolve a consulta para reaproveitar a última resposta válida por alguns segundos.
 * - Dentro da validade, devolve a mesma resposta, sem nova chamada à AwesomeAPI.
 * - Pedidos simultâneos compartilham uma única chamada à fonte.
 * - Uma falha nunca fica guardada: o pedido seguinte tenta a fonte de novo.
 * Cada operação continua gravando o horário informado pela fonte (data_cotacao).
 * @param {Function} consultar Função que busca as cotações (padrão: buscarCotacoes).
 * @param {number} validadeMs Tempo de reaproveitamento em milissegundos.
 * @param {Function} agora Relógio em milissegundos. performance.now() só avança, mesmo se o
 *                        horário do computador for ajustado (os testes usam um relógio falso).
 * @returns {Function} Função sem parâmetros que devolve uma Promise de cotações.
 */
function criarConsultaComCache(consultar = buscarCotacoes, validadeMs = VALIDADE_MS, agora = () => performance.now()) {
  let ultima = null; // { inicio: horário da consulta em ms, promessa: resposta esperada }
  return function consultarComCache() {
    if (ultima && agora() - ultima.inicio < validadeMs) return ultima.promessa;
    const atual = { inicio: agora(), promessa: consultar() };
    ultima = atual;
    atual.promessa.catch(() => {
      if (ultima === atual) ultima = null;
    });
    return atual.promessa;
  };
}

module.exports = { ATIVOS, buscarCotacoes, criarConsultaComCache, precoValido };
