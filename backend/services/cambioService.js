'use strict';

// ==========================================================================
// REGRAS FINANCEIRAS DA SIMULAÇÃO
//   VENDA:  o usuário entrega o ativo e recebe reais.  bruto = quantidade × bid
//   COMPRA: o usuário paga em reais e recebe o ativo.  bruto = orçamento em reais
//   Nas duas: taxa (spread didático) = 1% do bruto; líquido = bruto − taxa.
//   Na compra, quantidade recebida = líquido ÷ ask, cortada na precisão do ativo.
// Valores em reais são tratados em CENTAVOS inteiros e as contas usam BigInt
// (inteiros de tamanho livre). Assim evitamos erros de ponto flutuante como
// 0,1 + 0,2 = 0,30000000000000004.
// ==========================================================================
const { ATIVOS, precoValido } = require('./cotacoes');

// Limite didático de 1 bilhão (unidades do ativo ou reais) por operação.
const LIMITE = 1_000_000_000n;
// Casas decimais aceitas: dólar e euro usam centavos; o bitcoin vai até o satoshi (8 casas).
const CASAS = Object.freeze({ USD: 2, EUR: 2, BTC: 8 });

/** Cria um erro com status 400 (dados inválidos), que o server.js devolve em JSON. */
function invalido(mensagem) {
  return Object.assign(new Error(mensagem), { status: 400 });
}

/**
 * Converte um texto decimal em inteiro exato + escala.
 * Exemplo: "5.05" vira { unidades: 505n, escala: 100n }, ou seja, 505/100.
 * @param {string} texto Número decimal com ponto.
 * @returns {{unidades: bigint, escala: bigint}}
 */
function decimal(texto) {
  const [inteira, fracao = ''] = texto.split('.');
  return { unidades: BigInt(inteira + fracao), escala: 10n ** BigInt(fracao.length) };
}

/**
 * Faz o caminho inverso: transforma o inteiro em texto com o número de casas pedido.
 * Exemplo: formatarQuantidade(1800n, 2) → "18.00".
 */
function formatarQuantidade(unidades, casas) {
  const digitos = unidades.toString().padStart(casas + 1, '0');
  return digitos.slice(0, -casas) + '.' + digitos.slice(-casas);
}

/**
 * Confere o que veio do formulário antes de qualquer cálculo.
 * @param {object} dados { tipo: 'COMPRA'|'VENDA', ativo: 'USD'|'EUR'|'BTC', montante }.
 * @returns {{tipo, ativo, montante: string}} Montante padronizado com as casas da moeda.
 * @throws {Error} status 400 com a explicação do problema.
 */
function validarEntrada(dados) {
  const { tipo, ativo, montante } = dados ?? {};
  if (!['COMPRA', 'VENDA'].includes(tipo)) throw invalido('Selecione COMPRA ou VENDA.');
  if (!ATIVOS.includes(ativo)) throw invalido('Selecione USD, EUR ou BTC.');
  // Na compra o valor digitado é em reais (2 casas); na venda, em unidades do ativo.
  const casas = tipo === 'COMPRA' ? 2 : CASAS[ativo];
  // O formulário envia texto decimal. JSON também permite números como 1e-8 para BTC.
  let texto = montante;
  if (typeof montante === 'number' && Number.isFinite(montante)) {
    texto = String(montante);
    if (texto.includes('e') && Number(montante.toFixed(casas)) === montante) {
      texto = montante.toFixed(casas);
    }
  }
  // Aceita só dígitos, com ponto decimal opcional, e no máximo as casas permitidas.
  if (typeof texto !== 'string' || !/^\d{1,10}(\.\d{1,8})?$/.test(texto) ||
      (texto.split('.')[1]?.length ?? 0) > casas) {
    throw invalido('Informe um valor decimal positivo com até ' + casas + ' casas.');
  }
  const { unidades, escala } = decimal(texto);
  if (unidades === 0n || unidades > LIMITE * escala) throw invalido('O montante deve ser positivo e de até 1 bilhão.');
  // Devolve o montante sempre com o mesmo número de casas (ex.: "10" vira "10.00").
  return { tipo, ativo, montante: formatarQuantidade(unidades * 10n ** BigInt(casas) / escala, casas) };
}

/**
 * Divide inteiros arredondando para o mais próximo (meio centavo arredonda para cima).
 * Para números positivos, somar metade do denominador antes de dividir faz exatamente isso.
 * Exemplo: 1,15 USD × R$ 5,10 = R$ 5,865 = 586,5 centavos → 587 centavos (R$ 5,87).
 * Mesmo efeito de Math.round, mas sem ponto flutuante.
 */
function arredondar(numerador, denominador) {
  return (2n * numerador + denominador) / (2n * denominador);
}

/**
 * Calcula uma simulação completa com os preços recebidos da AwesomeAPI.
 * O navegador só informa tipo, ativo e montante: preço e taxa enviados por ele são ignorados.
 * @param {object} dados Formulário (tipo, ativo, montante).
 * @param {object} cotacoes Preços normalizados por cotacoes.js ({ USD: { bid, ask, data }, ... }).
 * @returns {object} Linha pronta para gravar em transacoes (valores em centavos e textos decimais).
 * @throws {Error} 400 para dados inválidos; 502 se faltar a cotação do ativo.
 */
function calcular(dados, cotacoes) {
  const { tipo, ativo, montante } = validarEntrada(dados);
  const compra = tipo === 'COMPRA';
  const referencia = cotacoes?.[ativo];
  // O cliente compra pelo ask (preço de venda da instituição) e vende pelo bid (preço de compra dela).
  const cotacao = compra ? referencia?.ask : referencia?.bid;
  if (!precoValido(cotacao) || typeof referencia.data !== 'string' || !Number.isFinite(Date.parse(referencia.data))) {
    throw Object.assign(new Error('Cotação indisponível para ' + ativo + '.'), { status: 502 });
  }
  const entrada = decimal(montante);
  const preco = decimal(cotacao);
  // BRUTO em centavos de real.
  //   Compra: o próprio orçamento (já está em centavos, pois tem 2 casas).
  //   Venda: quantidade × preço × 100, arredondado para o centavo mais próximo.
  const bruto = compra ? entrada.unidades : arredondar(entrada.unidades * preco.unidades * 100n, entrada.escala * preco.escala);
  if (bruto < 1n || bruto > LIMITE * 100n) throw invalido('O bruto deve ficar entre R$ 0,01 e R$ 1 bilhão.');
  // TAXA = 1% do bruto (bruto ÷ 100), arredondada em centavos. LÍQUIDO = bruto − taxa.
  const taxa = arredondar(bruto, 100n);
  const liquido = bruto - taxa;
  const escalaAtivo = 10n ** BigInt(CASAS[ativo]);
  // QUANTIDADE do ativo. Na compra, líquido ÷ ask; a divisão inteira descarta a fração
  // menor que a precisão do ativo, para nunca entregar mais do que o orçamento paga.
  // Na venda, é a própria quantidade informada.
  const quantidade = compra ? liquido * preco.escala * escalaAtivo / (100n * preco.unidades) : entrada.unidades;
  if (quantidade === 0n || quantidade > LIMITE * escalaAtivo) throw invalido('Quantidade do ativo fora dos limites de simulação.');

  // O limite de 1 bilhão de reais mantém os centavos abaixo do maior inteiro exato de Number,
  // por isso a conversão Number(...) abaixo não perde precisão.
  return { tipo, ativo, moeda_origem: compra ? 'BRL' : ativo, moeda_destino: compra ? ativo : 'BRL',
    montante, cotacao, spread: 0.01, bruto_centavos: Number(bruto), taxa_centavos: Number(taxa),
    liquido_centavos: Number(liquido), quantidade_ativo: formatarQuantidade(quantidade, CASAS[ativo]),
    data_cotacao: referencia.data };
}

module.exports = { validarEntrada, calcular };
