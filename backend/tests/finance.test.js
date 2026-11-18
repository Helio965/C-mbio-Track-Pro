'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calcular, validarEntrada } = require('../services/cambioService');
const { buscarCotacoes } = require('../services/cotacoes');

// Preços didáticos exclusivos do teste, com diferença visível entre bid e ask.
const data = '2026-10-29T12:00:00.000Z';
const cotacoes = {
  USD: { bid: '5.10', ask: '5.50', data },
  EUR: { bid: '6.00', ask: '6.50', data },
  BTC: { bid: '500000.00', ask: '550000.00', data }
};

function conferir(tipo, ativo, montante, esperado) {
  const resultado = calcular({ tipo, ativo, montante }, cotacoes);
  assert.deepEqual([resultado.bruto_centavos, resultado.taxa_centavos, resultado.liquido_centavos,
    resultado.quantidade_ativo, resultado.cotacao], esperado);
  assert.equal(resultado.data_cotacao, data);
  assert.equal(resultado.spread, 0.01);
}

test('venda de USD arredonda R$ 5,865 para 587 centavos e desconta 6 centavos', () => {
  conferir('VENDA', 'USD', '1.15', [587, 6, 581, '1.15', '5.10']);
});
test('compra de USD aplica ask e trunca a quantidade na segunda casa', () => {
  conferir('COMPRA', 'USD', '100', [10000, 100, 9900, '18.00', '5.50']);
  conferir('COMPRA', 'USD', '1', [100, 1, 99, '0.18', '5.50']);
  conferir('COMPRA', 'USD', '10.10', [1010, 10, 1000, '1.81', '5.50']);
});
test('venda e compra de EUR usam preços distintos e preservam unidades', () => {
  conferir('VENDA', 'EUR', '3.25', [1950, 20, 1930, '3.25', '6.00']);
  conferir('COMPRA', 'EUR', '10', [1000, 10, 990, '1.52', '6.50']);
  const compra = calcular({ tipo: 'COMPRA', ativo: 'EUR', montante: '10' }, cotacoes);
  assert.equal(compra.moeda_origem, 'BRL');
  assert.equal(compra.moeda_destino, 'EUR');
});
test('BTC admite satoshis e compra com até oito casas', () => {
  conferir('VENDA', 'BTC', '0.00000001', [1, 0, 1, '0.00000001', '500000.00']);
  conferir('VENDA', 'BTC', 1e-8, [1, 0, 1, '0.00000001', '500000.00']);
  conferir('COMPRA', 'BTC', '20', [2000, 20, 1980, '0.00003600', '550000.00']);
});
test('1 bilhão de BRL é aceito, acima do limite e saída abaixo da precisão são rejeitadas', () => {
  conferir('COMPRA', 'USD', '1000000000.00', [100000000000, 1000000000, 99000000000, '180000000.00', '5.50']);
  for (const [tipo, ativo, montante] of [
    ['COMPRA', 'USD', '1000000000.01'], ['VENDA', 'EUR', '1000000000'],
    ['COMPRA', 'USD', '0.01'], ['VENDA', 'BTC', '2000.00000002']
  ]) assert.throws(() => calcular({ tipo, ativo, montante }, cotacoes), { status: 400 });
});
test('entrada rejeita estrutura, tipo, ativo, precisão e números inválidos', () => {
  for (const montante of [0, -1, '', '1.001', '1e2', Infinity, true, null, NaN, '1,00', [1], {}, '01..3']) {
    assert.throws(() => validarEntrada({ tipo: 'COMPRA', ativo: 'USD', montante }), { status: 400 });
  }
  for (const dados of [null, {}, { tipo: 'TROCA', ativo: 'USD', montante: 1 },
    { tipo: 'VENDA', ativo: 'BRL', montante: 1 }, { tipo: 'VENDA', ativo: 'BTC', montante: '0.000000001' }]) {
    assert.throws(() => validarEntrada(dados), { status: 400 });
  }
});
test('o servidor ignora preço e taxa enviados pelo navegador', () => {
  const resultado = calcular({ tipo: 'VENDA', ativo: 'USD', montante: '1', cotacao: '100', spread: 0 }, cotacoes);
  assert.equal(resultado.liquido_centavos, 505);
  assert.equal(resultado.cotacao, '5.10');
  assert.throws(() => calcular({ tipo: 'VENDA', ativo: 'USD', montante: '1' }, {}), { status: 502 });
});

function respostaDaFonte() {
  return Object.fromEntries(Object.entries(cotacoes).map(([code, { bid, ask }]) =>
    [code + 'BRL', { code, codein: 'BRL', bid, ask, timestamp: String(Date.parse(data) / 1000), pctChange: '-1.2' }]));
}

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
test('campos ausentes ou inválidos impedem usar a resposta parcial', async () => {
  for (const alteracao of [{ bid: '0' }, { ask: '-1' }, { bid: 'erro' }, { ask: '4' }, { timestamp: 'x' },
    { timestamp: true }, { code: 'EUR' }, { codein: 'USD' }]) {
    const dados = respostaDaFonte();
    Object.assign(dados.USDBRL, alteracao);
    await assert.rejects(buscarCotacoes(async () => Response.json(dados)), { status: 502 });
  }
  await assert.rejects(buscarCotacoes(async () => Response.json({})), { status: 502 });
});
test('o preço de venda da fonte não pode ficar abaixo do preço de compra por uma casa decimal', async () => {
  const dados = respostaDaFonte();
  dados.BTCBRL.bid = '410000.000000000009';
  dados.BTCBRL.ask = '410000.000000000008';
  await assert.rejects(buscarCotacoes(async () => Response.json(dados)), { status: 502 });
  dados.BTCBRL.ask = '410000.00000000001';
  const resultado = await buscarCotacoes(async () => Response.json(dados));
  assert.equal(resultado.BTC.ask, dados.BTCBRL.ask);
});
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
