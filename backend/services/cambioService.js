'use strict';

const { ATIVOS, precoValido } = require('./cotacoes');
const LIMITE = 1_000_000_000n;
const CASAS = Object.freeze({ USD: 2, EUR: 2, BTC: 8 });

function invalido(mensagem) {
  return Object.assign(new Error(mensagem), { status: 400 });
}

// Inteiros BigInt carregam os dígitos exatos. Por exemplo, "5.05" vira 505/100.
function decimal(texto) {
  const [inteira, fracao = ''] = texto.split('.');
  return { unidades: BigInt(inteira + fracao), escala: 10n ** BigInt(fracao.length) };
}

function formatarQuantidade(unidades, casas) {
  const digitos = unidades.toString().padStart(casas + 1, '0');
  return digitos.slice(0, -casas) + '.' + digitos.slice(-casas);
}

function validarEntrada(dados) {
  const { tipo, ativo, montante } = dados ?? {};
  if (!['COMPRA', 'VENDA'].includes(tipo)) throw invalido('Selecione COMPRA ou VENDA.');
  if (!ATIVOS.includes(ativo)) throw invalido('Selecione USD, EUR ou BTC.');
  const casas = tipo === 'COMPRA' ? 2 : CASAS[ativo];
  // O formulário envia texto decimal. JSON também permite números como 1e-8 para BTC.
  let texto = montante;
  if (typeof montante === 'number' && Number.isFinite(montante)) {
    texto = String(montante);
    if (texto.includes('e') && Number(montante.toFixed(casas)) === montante) {
      texto = montante.toFixed(casas);
    }
  }
  if (typeof texto !== 'string' || !/^\d{1,10}(\.\d{1,8})?$/.test(texto) ||
      (texto.split('.')[1]?.length ?? 0) > casas) {
    throw invalido('Informe um valor decimal positivo com até ' + casas + ' casas.');
  }
  const { unidades, escala } = decimal(texto);
  if (unidades === 0n || unidades > LIMITE * escala) throw invalido('O montante deve ser positivo e de até 1 bilhão.');
  return { tipo, ativo, montante: formatarQuantidade(unidades * 10n ** BigInt(casas) / escala, casas) };
}

// Para números positivos, somar metade do denominador antes de dividir arredonda meio para cima.
function arredondar(numerador, denominador) {
  return (2n * numerador + denominador) / (2n * denominador);
}

function calcular(dados, cotacoes) {
  const { tipo, ativo, montante } = validarEntrada(dados);
  const compra = tipo === 'COMPRA';
  const referencia = cotacoes?.[ativo];
  const cotacao = compra ? referencia?.ask : referencia?.bid;
  if (!precoValido(cotacao) || typeof referencia.data !== 'string' || !Number.isFinite(Date.parse(referencia.data))) {
    throw Object.assign(new Error('Cotação indisponível para ' + ativo + '.'), { status: 502 });
  }
  const entrada = decimal(montante);
  const preco = decimal(cotacao);
  // O cliente compra pelo ask e vende pelo bid da instituição. Todos os totais são em BRL.
  const bruto = compra ? entrada.unidades : arredondar(entrada.unidades * preco.unidades * 100n, entrada.escala * preco.escala);
  if (bruto < 1n || bruto > LIMITE * 100n) throw invalido('O bruto deve ficar entre R$ 0,01 e R$ 1 bilhão.');
  const taxa = arredondar(bruto, 100n);
  const liquido = bruto - taxa;
  const escalaAtivo = 10n ** BigInt(CASAS[ativo]);
  // Na compra truncamos a fração indivisível do ativo para nunca exceder o orçamento líquido.
  const quantidade = compra ? liquido * preco.escala * escalaAtivo / (100n * preco.unidades) : entrada.unidades;
  if (quantidade === 0n || quantidade > LIMITE * escalaAtivo) throw invalido('Quantidade do ativo fora dos limites de simulação.');

  // O limite de 1 bilhão de BRL mantém os centavos abaixo do maior inteiro exato de Number.
  return { tipo, ativo, moeda_origem: compra ? 'BRL' : ativo, moeda_destino: compra ? ativo : 'BRL',
    montante, cotacao, spread: 0.01, bruto_centavos: Number(bruto), taxa_centavos: Number(taxa),
    liquido_centavos: Number(liquido), quantidade_ativo: formatarQuantidade(quantidade, CASAS[ativo]),
    data_cotacao: referencia.data };
}

module.exports = { validarEntrada, calcular };
