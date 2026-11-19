'use strict';

// ==========================================================================
// TESTES DOS CÁLCULOS E DA CONSULTA À FONTE (npm test)
// Usam preços didáticos e respostas simuladas da AwesomeAPI, sem internet. Os valores
// esperados foram conferidos à mão: bruto, spread de 1%, líquido, quantidade e cotação.
// ==========================================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { calcular, validarEntrada } = require('../services/cambioService');
const { buscarCotacoes, criarConsultaComCache } = require('../services/cotacoes');

// Preços didáticos exclusivos do teste, com diferença visível entre bid e ask.
const data = '2026-10-29T12:00:00.000Z';
const cotacoes = {
  USD: { bid: '5.10', ask: '5.50', data },
  EUR: { bid: '6.00', ask: '6.50', data },
  BTC: { bid: '500000.00', ask: '550000.00', data }
};

/**
 * Calcula a operação com os preços do teste e compara com o esperado:
 * [bruto em centavos, taxa em centavos, líquido em centavos, quantidade do ativo, cotação usada].
 */
function conferir(tipo, ativo, montante, esperado) {
  const resultado = calcular({ tipo, ativo, montante }, cotacoes);
  assert.deepEqual([resultado.bruto_centavos, resultado.taxa_centavos, resultado.liquido_centavos,
    resultado.quantidade_ativo, resultado.cotacao], esperado);
  assert.equal(resultado.data_cotacao, data);
  assert.equal(resultado.spread, 0.01);
}

// Venda: 1,15 × 5,10 = R$ 5,865 → 587 centavos; 1% de 587 = 5,87 → 6 centavos de taxa.
test('venda de USD arredonda R$ 5,865 para 587 centavos e desconta 6 centavos', () => {
  conferir('VENDA', 'USD', '1.15', [587, 6, 581, '1.15', '5.10']);
});
// Compra: (orçamento − 1%) ÷ ask, cortando o que passar de 2 casas (nunca arredonda para cima).
test('compra de USD aplica ask e trunca a quantidade na segunda casa', () => {
  conferir('COMPRA', 'USD', '100', [10000, 100, 9900, '18.00', '5.50']);
  conferir('COMPRA', 'USD', '1', [100, 1, 99, '0.18', '5.50']);
  conferir('COMPRA', 'USD', '10.10', [1010, 10, 1000, '1.81', '5.50']);
});
// Venda usa o bid e compra usa o ask; na compra a moeda de origem é o real.
test('venda e compra de EUR usam preços distintos e preservam unidades', () => {
  conferir('VENDA', 'EUR', '3.25', [1950, 20, 1930, '3.25', '6.00']);
  conferir('COMPRA', 'EUR', '10', [1000, 10, 990, '1.52', '6.50']);
  const compra = calcular({ tipo: 'COMPRA', ativo: 'EUR', montante: '10' }, cotacoes);
  assert.equal(compra.moeda_origem, 'BRL');
  assert.equal(compra.moeda_destino, 'EUR');
});
// Bitcoin aceita até 8 casas (1 satoshi = 0,00000001 BTC), em texto ou em número.
test('BTC admite satoshis e compra com até oito casas', () => {
  conferir('VENDA', 'BTC', '0.00000001', [1, 0, 1, '0.00000001', '500000.00']);
  conferir('VENDA', 'BTC', 1e-8, [1, 0, 1, '0.00000001', '500000.00']);
  conferir('COMPRA', 'BTC', '20', [2000, 20, 1980, '0.00003600', '550000.00']);
});
// Limites: até R$ 1 bilhão de bruto e quantidade maior que zero na precisão do ativo.
test('1 bilhão de BRL é aceito, acima do limite e saída abaixo da precisão são rejeitadas', () => {
  conferir('COMPRA', 'USD', '1000000000.00', [100000000000, 1000000000, 99000000000, '180000000.00', '5.50']);
  for (const [tipo, ativo, montante] of [
    ['COMPRA', 'USD', '1000000000.01'], ['VENDA', 'EUR', '1000000000'],
    ['COMPRA', 'USD', '0.01'], ['VENDA', 'BTC', '2000.00000002']
  ]) assert.throws(() => calcular({ tipo, ativo, montante }, cotacoes), { status: 400 });
});
// Formatos inválidos recebem 400: zero, negativos, casas demais, vírgula, notação 1e2 etc.
test('entrada rejeita estrutura, tipo, ativo, precisão e números inválidos', () => {
  for (const montante of [0, -1, '', '1.001', '1e2', Infinity, true, null, NaN, '1,00', [1], {}, '01..3']) {
    assert.throws(() => validarEntrada({ tipo: 'COMPRA', ativo: 'USD', montante }), { status: 400 });
  }
  for (const dados of [null, {}, { tipo: 'TROCA', ativo: 'USD', montante: 1 },
    { tipo: 'VENDA', ativo: 'BRL', montante: 1 }, { tipo: 'VENDA', ativo: 'BTC', montante: '0.000000001' }]) {
    assert.throws(() => validarEntrada(dados), { status: 400 });
  }
});
// Um navegador adulterado não consegue impor preço ou taxa: o servidor usa a cotação dele.
test('o servidor ignora preço e taxa enviados pelo navegador', () => {
  const resultado = calcular({ tipo: 'VENDA', ativo: 'USD', montante: '1', cotacao: '100', spread: 0 }, cotacoes);
  assert.equal(resultado.liquido_centavos, 505);
  assert.equal(resultado.cotacao, '5.10');
  assert.throws(() => calcular({ tipo: 'VENDA', ativo: 'USD', montante: '1' }, {}), { status: 502 });
});

/** Monta uma resposta no formato da AwesomeAPI (USDBRL, EURBRL, BTCBRL) para simular a fonte. */
function respostaDaFonte() {
  return Object.fromEntries(Object.entries(cotacoes).map(([code, { bid, ask }]) =>
    [code + 'BRL', { code, codein: 'BRL', bid, ask, timestamp: String(Date.parse(data) / 1000), pctChange: '-1.2' }]));
}

// A consulta usa o endereço oficial, um tempo limite e conserva preço, variação e horário.
test('Fetch valida os pares e conserva preço, variação e data da fonte', async () => {
  const dados = respostaDaFonte();
  delete dados.EURBRL.pctChange;
  const resultado = await buscarCotacoes(async (url, { signal }) => {
    assert.equal(url, 'https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL');
    assert.ok(signal instanceof AbortSignal);
    return Response.json(dados);
  });
  assert.deepEqual(resultado.USD, { ...cotacoes.USD, variacao: -1.2 });
  assert.equal(resultado.EUR.variacao, null);
});
// Qualquer campo ruim em qualquer par invalida a resposta inteira (502).
test('campos ausentes ou inválidos impedem usar a resposta parcial', async () => {
  for (const alteracao of [{ bid: '0' }, { ask: '-1' }, { bid: 'erro' }, { ask: '4' }, { timestamp: 'x' },
    { timestamp: true }, { code: 'EUR' }, { codein: 'USD' }]) {
    const dados = respostaDaFonte();
    Object.assign(dados.USDBRL, alteracao);
    await assert.rejects(buscarCotacoes(async () => Response.json(dados)), { status: 502 });
  }
  await assert.rejects(buscarCotacoes(async () => Response.json({})), { status: 502 });
});
// A comparação entre bid e ask é exata até a 12ª casa decimal.
test('o preço de venda da fonte não pode ficar abaixo do preço de compra por uma casa decimal', async () => {
  const dados = respostaDaFonte();
  dados.BTCBRL.bid = '410000.000000000009';
  dados.BTCBRL.ask = '410000.000000000008';
  await assert.rejects(buscarCotacoes(async () => Response.json(dados)), { status: 502 });
  dados.BTCBRL.ask = '410000.00000000001';
  const resultado = await buscarCotacoes(async () => Response.json(dados));
  assert.equal(resultado.BTC.ask, dados.BTCBRL.ask);
});
// Sem internet, HTTP de erro ou corpo inválido: 502. Demora acima do limite: 504.
test('falhas de rede, HTTP, JSON e tempo limite recebem erros públicos', async () => {
  for (const resposta of [async () => { throw new TypeError('network'); },
    async () => new Response(null, { status: 429 }), async () => new Response(null, { status: 500 }),
    async () => new Response(''), async () => new Response('<html>')]) {
    await assert.rejects(buscarCotacoes(resposta), { status: 502 });
  }
  // Cancela exatamente como uma requisição pendente, inclusive após ultrapassar o prazo.
  const pendente = (_url, { signal }) => new Promise((resolve, reject) => {
    const recurso = setTimeout(resolve, 1000);
    signal.addEventListener('abort', () => { clearTimeout(recurso); reject(signal.reason); }, { once: true });
  });
  await assert.rejects(buscarCotacoes(pendente, 5), { status: 504 });
});
// O 429 (cota de uso esgotada) recebe uma mensagem própria.
test('HTTP 429 da fonte explica o limite de uso em vez de indisponibilidade genérica', async () => {
  const resposta = async () => Response.json({ status: 429, code: 'QuotaExceeded' }, { status: 429 });
  await assert.rejects(buscarCotacoes(resposta), erro =>
    erro.status === 502 && /limite de uso/.test(erro.message) && /429/.test(erro.message));
});
// A chave opcional segue no cabeçalho (não aparece em endereços nem em registros de acesso).
test('a chave opcional da AwesomeAPI vai no cabeçalho x-api-key, nunca na URL', async () => {
  const pedidos = [];
  const fonte = async (url, { headers }) => {
    pedidos.push({ url, headers: new Headers(headers) });
    return Response.json(respostaDaFonte());
  };
  await buscarCotacoes(fonte, 1000, ' chave-de-teste ');
  await buscarCotacoes(fonte, 1000, '');
  assert.equal(pedidos[0].headers.get('x-api-key'), 'chave-de-teste');
  assert.equal(pedidos[1].headers.has('x-api-key'), false);
  assert.ok(pedidos.every(({ url }) => !url.includes('chave')));
});
// Reaproveitamento com relógio falso: vale por 30 s (o padrão de produção), não guarda
// falhas, junta pedidos simultâneos e nunca reaproveita se o relógio voltar ou saltar.
test('a API reaproveita a última cotação válida por 30 s (padrão de produção) e nunca guarda falhas', async () => {
  let relogio = 0;
  let chamadas = 0;
  let falhar = false;
  const consultar = async () => {
    chamadas++;
    if (falhar) throw Object.assign(new Error('fonte fora do ar'), { status: 502 });
    return { consulta: chamadas };
  };
  // undefined = usa a validade padrão de produção (VALIDADE_MS, 30 s).
  const cotacoesComCache = criarConsultaComCache(consultar, undefined, () => relogio);
  assert.deepEqual(await cotacoesComCache(), { consulta: 1 });
  relogio = 29999;
  assert.deepEqual(await cotacoesComCache(), { consulta: 1 });
  assert.equal(chamadas, 1);
  relogio = 30000;
  assert.deepEqual(await cotacoesComCache(), { consulta: 2 });

  falhar = true;
  relogio = 70000;
  await assert.rejects(cotacoesComCache(), { status: 502 });
  await assert.rejects(cotacoesComCache(), { status: 502 });
  assert.equal(chamadas, 4); // cada pedido após a falha consulta a fonte outra vez

  falhar = false;
  const [primeira, segunda] = await Promise.all([cotacoesComCache(), cotacoesComCache()]);
  assert.equal(primeira, segunda);
  assert.equal(chamadas, 5); // pedidos simultâneos compartilham uma única consulta

  // Horário ajustado para trás: a idade fica negativa e a fonte é consultada de novo.
  relogio = 60000;
  assert.deepEqual(await cotacoesComCache(), { consulta: 6 });
  // Computador suspenso por 1 hora: o relógio avançou e a cotação antiga não é reaproveitada.
  relogio = 60000 + 3_600_000;
  assert.deepEqual(await cotacoesComCache(), { consulta: 7 });
});
