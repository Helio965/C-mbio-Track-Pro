'use strict';

// ==========================================================================
// TESTES AUTOMÁTICOS DA API (npm test)
// Cada teste liga o servidor real (Express) numa porta livre, com um banco SQLite
// temporário e cotações fixas, faz requisições HTTP como o navegador faria e confere
// as respostas. O banco real em backend/data nunca é usado.
// ==========================================================================
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { abrirBanco } = require('../database');
const { createApp } = require('../server');

// Cada caso usa uma porta e um arquivo SQLite próprios. As únicas cotações
// controladas entram pela função passada ao servidor durante o teste.
const cotacoesFixas = {
  USD: { bid: '5', ask: '5.5', data: '2026-11-10T10:00:00.000Z', variacao: 0.1 },
  EUR: { bid: '6', ask: '6.2', data: '2026-11-10T10:00:00.000Z', variacao: -0.2 },
  BTC: { bid: '410000', ask: '415000', data: '2026-11-10T10:00:00.000Z', variacao: 1.3 }
};
const venda = { tipo: 'VENDA', ativo: 'USD', montante: '10.25' };
const compra = { tipo: 'COMPRA', ativo: 'USD', montante: '100' };

/**
 * Faz uma chamada HTTP ao servidor de teste e confere o código de resposta esperado.
 * Em respostas de erro (4xx/5xx), exige o campo "erro" no JSON; em 204, corpo vazio.
 * @returns {Promise<object|undefined>} Corpo JSON da resposta.
 */
async function requisitar(base, metodo, rota, status, dados, token) {
  const cabecalhos = {};
  if (token) cabecalhos.Authorization = 'Bearer ' + token;
  if (dados !== undefined) cabecalhos['Content-Type'] = 'application/json';
  const resposta = await fetch(base + rota, {
    method: metodo,
    headers: cabecalhos,
    body: dados === undefined ? undefined : JSON.stringify(dados)
  });
  const texto = await resposta.text();
  assert.equal(resposta.status, status, metodo + ' ' + rota + ' → ' + resposta.status);
  if (status === 204) {
    assert.equal(texto, '');
    return;
  }
  assert.match(resposta.headers.get('content-type'), /application\/json/);
  const corpo = JSON.parse(texto);
  if (status >= 400) {
    assert.equal(typeof corpo.erro, 'string');
    assert.ok(corpo.erro.length > 0);
  }
  return corpo;
}

/**
 * Liga uma API completa só para o teste: pasta temporária com banco próprio, chave JWT
 * aleatória e porta livre (0 = o sistema escolhe). ligar/desligar permitem simular um
 * reinício; ao final do teste (t.after), o servidor é desligado e a pasta é apagada.
 */
async function ambiente(t, buscarCotacoes = async () => cotacoesFixas) {
  const diretorio = await mkdtemp(path.join(tmpdir(), 'cambiotrack-api-'));
  const arquivo = path.join(diretorio, 'carteira.sqlite');
  const jwtSecret = randomBytes(32).toString('hex');
  let db;
  let servidor;
  async function ligar() {
    db = abrirBanco(arquivo);
    const app = createApp({ db, jwtSecret, buscarCotacoes, frontendOrigins: 'http://localhost:5173' });
    servidor = app.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
  }
  async function desligar() {
    if (servidor) {
      await new Promise((resolve, reject) => servidor.close(err => err ? reject(err) : resolve()));
      servidor = undefined;
    }
    if (db) {
      db.close();
      db = undefined;
    }
  }
  t.after(async () => {
    await desligar();
    await rm(diretorio, { recursive: true, force: true });
  });
  await ligar();
  return {
    get db() { return db; },
    get base() { return 'http://127.0.0.1:' + servidor.address().port + '/api'; },
    jwtSecret, arquivo, diretorio, ligar, desligar,
    req(...args) { return requisitar(this.base, ...args); }
  };
}

/** Dados de uma conta de teste, com senha aleatória a cada execução. */
function dadosConta(id = 'principal') {
  return {
    nome: 'Conta ' + id,
    email: id + '@example.test',
    senha: randomBytes(15).toString('base64url')
  };
}

/** Cadastra a conta e faz login; devolve o token JWT usado nas rotas privadas. */
async function cadastrarEEntrar(api, dados = dadosConta()) {
  await api.req('POST', '/auth/register', 201, dados);
  const { token, usuario } = await api.req('POST', '/auth/login', 200, dados);
  assert.equal(usuario.email, dados.email);
  return { token, usuario, dados };
}

// O cadastro guarda só o hash Bcrypt, recusa e-mail repetido e o login devolve um JWT
// com conta, data de criação e vencimento. Erro de senha e de e-mail têm a mesma mensagem.
test('cadastro, hash bcrypt, e-mail único e token com expiração', async t => {
  const api = await ambiente(t);
  const dados = dadosConta();
  const { usuario } = await api.req('POST', '/auth/register', 201, {
    ...dados, email: '  ' + dados.email.toUpperCase() + '  '
  });
  assert.equal(usuario.email, dados.email);
  assert.equal(usuario.nome, dados.nome);
  const registro = api.db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(usuario.id);
  assert.ok(await bcrypt.compare(dados.senha, registro.senha_hash));
  assert.notEqual(dados.senha, registro.senha_hash);
  await api.req('POST', '/auth/register', 409, dados);

  const sessao = await api.req('POST', '/auth/login', 200, dados);
  const claims = jwt.verify(sessao.token, api.jwtSecret, { algorithms: ['HS256'] });
  assert.equal(claims.sub, String(usuario.id));
  assert.equal(claims.criado_em, usuario.criado_em);
  assert.ok(claims.exp > claims.iat);
  const perfil = await api.req('GET', '/auth/me', 200, undefined, sessao.token);
  for (const pessoa of [usuario, sessao.usuario, perfil.usuario]) {
    assert.equal(pessoa.id, usuario.id);
    assert.equal(pessoa.senha, undefined);
    assert.equal(pessoa.senha_hash, undefined);
  }
  const errSenha = await api.req('POST', '/auth/login', 401, { ...dados, senha: dados.senha + 'x' });
  const errEmail = await api.req('POST', '/auth/login', 401, { ...dados, email: 'outra@example.test' });
  assert.equal(errEmail.erro, errSenha.erro);
});

// Dados inválidos não criam contas, e o banco tem as chaves estrangeiras ligadas.
test('validação do cadastro e integridade do SQLite', async t => {
  const api = await ambiente(t);
  const dados = dadosConta();
  await api.req('POST', '/auth/register', 400, {});
  await api.req('POST', '/auth/login', 400, {});
  for (const mudanca of [{ nome: ' ' }, { email: 'incompleto' }, { senha: '123' }, { senha: 'é'.repeat(37) }]) {
    await api.req('POST', '/auth/register', 400, { ...dados, ...mudanca });
  }
  assert.equal(api.db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total, 0);
  assert.equal(api.db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  const chaves = api.db.prepare('PRAGMA foreign_key_list(transacoes)').all();
  assert.ok(chaves.some(chave => chave.table === 'usuarios' && chave.from === 'usuario_id'));
  // O caminho já é um diretório, portanto não pode ser aberto como arquivo de banco.
  assert.throws(() => abrirBanco(api.diretorio));
});

// Sem token, todas as rotas privadas respondem 401. Tokens forjados com a data de criação
// correta só falham pelo defeito testado (vencido, outra chave ou sem a data da conta).
test('cada rota privada exige autenticação; me recusa tokens inválidos ou expirados', async t => {
  const api = await ambiente(t);
  for (const [metodo, rota] of [
    ['GET', '/auth/me'], ['GET', '/transacoes'], ['POST', '/transacoes'],
    ['GET', '/transacoes/resumo'], ['POST', '/transacoes/previa'],
    ['PATCH', '/transacoes/1/cancelar'], ['DELETE', '/transacoes/1']
  ]) {
    await api.req(metodo, rota, 401);
  }
  const { usuario } = await cadastrarEEntrar(api);
  const conteudo = { criado_em: usuario.criado_em };
  const opcoes = { algorithm: 'HS256', issuer: 'cambio-track-pro', subject: String(usuario.id) };
  // Controle: um token montado assim, com a chave certa e dentro da validade, é aceito.
  const correto = jwt.sign(conteudo, api.jwtSecret, { ...opcoes, expiresIn: '1h' });
  await api.req('GET', '/auth/me', 200, undefined, correto);
  const expirado = jwt.sign(conteudo, api.jwtSecret, { ...opcoes, expiresIn: -1 });
  const outraChave = randomBytes(32);
  const assinaturaInvalida = jwt.sign(conteudo, outraChave, { ...opcoes, expiresIn: '1h' });
  const semDataDaConta = jwt.sign({}, api.jwtSecret, { ...opcoes, expiresIn: '1h' });
  for (const token of ['invalido', expirado, assinaturaInvalida, semDataDaConta]) {
    await api.req('GET', '/auth/me', 401, undefined, token);
  }
});

// Quem apaga o banco para recomeçar pode dar o mesmo número de conta a outra pessoa.
// O token antigo não pode abrir a carteira dessa nova conta.
test('token emitido antes de recriar o banco não abre a conta que recebeu o mesmo número', async t => {
  const api = await ambiente(t);
  const antiga = await cadastrarEEntrar(api, dadosConta('antiga'));
  // Apaga o arquivo SQLite e liga a API de novo com a mesma JWT_SECRET.
  await api.desligar();
  await rm(api.arquivo, { force: true });
  await api.ligar();
  const nova = await cadastrarEEntrar(api, dadosConta('nova'));
  assert.equal(nova.usuario.id, antiga.usuario.id); // o banco novo recomeça a numeração
  await api.req('GET', '/auth/me', 401, undefined, antiga.token);
  await api.req('GET', '/transacoes', 401, undefined, antiga.token);
  const perfil = await api.req('GET', '/auth/me', 200, undefined, nova.token);
  assert.equal(perfil.usuario.email, nova.dados.email);
});

// CORS: o front-end configurado passa no preflight; outra origem recebe 403. Erros de
// formato do corpo (JSON quebrado, charset errado) também respondem em JSON.
test('preflight permite o cliente configurado e erros do protocolo usam JSON', async t => {
  const api = await ambiente(t);
  const origem = 'http://localhost:5173';
  const preflight = await fetch(api.base + '/transacoes', {
    method: 'OPTIONS',
    headers: { Origin: origem, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origem);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
  const recusa = await fetch(api.base + '/cotacoes', { headers: { Origin: 'https://outra.example' } });
  assert.equal(recusa.status, 403);
  assert.equal(recusa.headers.get('access-control-allow-origin'), null);
  assert.equal(typeof (await recusa.json()).erro, 'string');
  const incompleto = await fetch(api.base + '/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
  });
  assert.equal(incompleto.status, 400);
  assert.deepEqual(Object.keys(await incompleto.json()), ['erro']);
  const charset = await fetch(api.base + '/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=iso-8859-1' }, body: '{}'
  });
  assert.equal(charset.status, 415);
  assert.deepEqual(Object.keys(await charset.json()), ['erro']);
});

// Depois de 10 logins errados, o 11º recebe 429 (excesso de tentativas).
test('limite de dez tentativas de login falhas', async t => {
  const api = await ambiente(t);
  const dados = dadosConta();
  for (let i = 0; i < 10; i++) {
    await api.req('POST', '/auth/login', 401, dados);
  }
  await api.req('POST', '/auth/login', 429, dados);
});

// Fluxo completo da carteira com valores conferidos à mão: prévia, venda, compra,
// resumo, cancelamento (fica no histórico) e exclusão (sai do banco).
test('prévia, compra e venda usam a cotação do servidor; resumo acompanha cancelamento e exclusão', async t => {
  let cotacoes = structuredClone(cotacoesFixas);
  const api = await ambiente(t, async () => cotacoes);
  const { token } = await cadastrarEEntrar(api);
  const consulta = await api.req('GET', '/cotacoes', 200);
  assert.deepEqual(consulta, cotacoes);
  const previa = await api.req('POST', '/transacoes/previa', 200, venda, token);
  // 10,25 USD a R$ 5 dão R$ 51,25; a taxa de R$ 0,5125 arredonda para R$ 0,51.
  assert.equal(previa.liquido_centavos, 5074);
  assert.deepEqual(await api.req('GET', '/transacoes', 200, undefined, token), []);
  const v = await api.req('POST', '/transacoes', 201, venda, token);
  const c = await api.req('POST', '/transacoes', 201, compra, token);
  assert.equal(v.bruto_centavos, 5125);
  assert.equal(v.taxa_centavos, 51);
  assert.equal(v.liquido_centavos, 5074);
  assert.equal(Number(v.cotacao), 5);
  assert.equal(Number(c.cotacao), 5.5);
  assert.equal(Number(c.quantidade_ativo), 18); // (R$ 100 − R$ 1) / 5,50
  assert.equal(c.data_cotacao, cotacoes.USD.data);

  // Um preço novo na fonte não altera as operações já gravadas.
  cotacoes = { ...cotacoes, USD: { ...cotacoes.USD, bid: '7.5' } };
  const resumo = () => api.req('GET', '/transacoes/resumo', 200, undefined, token);
  const historico = () => api.req('GET', '/transacoes', 200, undefined, token);
  assert.deepEqual(await resumo(), { total: 2, ativas: 2, movimentado_centavos: 15125 });
  assert.equal(Number((await historico()).find(linha => linha.id === v.id).cotacao), 5);

  const cancelar = '/transacoes/' + v.id + '/cancelar';
  const cancelada = await api.req('PATCH', cancelar, 200, undefined, token);
  assert.equal(cancelada.status, 'CANCELADA');
  await api.req('PATCH', cancelar, 409, undefined, token);
  assert.deepEqual(await resumo(), { total: 2, ativas: 1, movimentado_centavos: 10000 });
  await api.req('DELETE', '/transacoes/' + v.id, 204, undefined, token);
  assert.deepEqual((await historico()).map(linha => linha.id), [c.id]);
  assert.deepEqual(await resumo(), { total: 1, ativas: 1, movimentado_centavos: 10000 });
  await api.req('DELETE', '/transacoes/' + v.id, 404, undefined, token);
  await api.req('DELETE', '/transacoes/' + c.id, 204, undefined, token);
  const nova = await api.req('POST', '/transacoes', 201, compra, token);
  // Uma aba antiga pode guardar ambos os IDs mesmo após a remoção dos registros.
  assert.ok(nova.id > c.id);
  await api.req('DELETE', '/transacoes/' + v.id, 404, undefined, token);
});

// Uma conta não vê, não cancela e não exclui as operações de outra.
test('carteiras independentes para duas contas', async t => {
  const api = await ambiente(t);
  const a = await cadastrarEEntrar(api);
  const b = await cadastrarEEntrar(api, dadosConta('secundaria'));
  const linha = await api.req('POST', '/transacoes', 201, venda, a.token);
  assert.deepEqual(await api.req('GET', '/transacoes', 200, undefined, b.token), []);
  assert.deepEqual(await api.req('GET', '/transacoes/resumo', 200, undefined, b.token),
    { total: 0, ativas: 0, movimentado_centavos: 0 });
  await api.req('PATCH', '/transacoes/' + linha.id + '/cancelar', 404, undefined, b.token);
  await api.req('DELETE', '/transacoes/' + linha.id, 404, undefined, b.token);
  const salvas = await api.req('GET', '/transacoes', 200, undefined, a.token);
  assert.equal(salvas.length, 1);
  assert.equal(salvas[0].status, 'ATIVA');
});

// Entradas malformadas param antes de consultar a fonte; com a fonte fora do ar, novas
// operações recebem 502, mas o histórico já salvo continua legível.
test('entrada inválida e indisponibilidade externa conservam o histórico anterior', async t => {
  let disponivel = true;
  let consultas = 0;
  const api = await ambiente(t, async () => {
    consultas++;
    if (!disponivel) throw Object.assign(new Error('Provedor indisponível'), { status: 502 });
    return cotacoesFixas;
  });
  const { token } = await cadastrarEEntrar(api);
  for (const mudanca of [{ ativo: 'JPY' }, { tipo: 'TROCA' }, { montante: '0' }, { montante: '0.001' }]) {
    await api.req('POST', '/transacoes', 400, { ...venda, ...mudanca }, token);
  }
  assert.equal(consultas, 0);
  const salva = await api.req('POST', '/transacoes', 201, venda, token);
  disponivel = false;
  await api.req('GET', '/cotacoes', 502);
  await api.req('POST', '/transacoes', 502, venda, token);
  const historico = await api.req('GET', '/transacoes', 200, undefined, token);
  assert.deepEqual(historico.map(linha => linha.id), [salva.id]);
  await api.req('GET', '/nao-encontrada', 404);
  await api.req('DELETE', '/transacoes/abc', 400, undefined, token);
});

// Persistência: desligar o servidor e fechar o banco não apaga nada; um novo login
// encontra exatamente a mesma operação.
test('servidor e conexão SQLite reabertos leem a operação em uma nova sessão', async t => {
  const api = await ambiente(t);
  const { dados, usuario, token } = await cadastrarEEntrar(api);
  const salva = await api.req('POST', '/transacoes', 201, compra, token);
  const linha = api.db.prepare('SELECT usuario_id, bruto_centavos FROM transacoes WHERE id = ?').get(salva.id);
  assert.equal(linha.usuario_id, usuario.id);
  assert.equal(linha.bruto_centavos, 10000);
  await api.desligar();
  await api.ligar();
  const novaSessao = await api.req('POST', '/auth/login', 200, dados);
  const historico = await api.req('GET', '/transacoes', 200, undefined, novaSessao.token);
  assert.deepEqual(historico, [salva]);
});

// Configuração de produção (sem cotações injetadas): dois pedidos seguidos geram uma única
// consulta à AwesomeAPI, e a chave opcional vai no cabeçalho x-api-key.
test('sem fonte injetada, a API reaproveita a consulta à AwesomeAPI entre pedidos seguidos e envia a chave opcional', async t => {
  // Substitui apenas a saída HTTPS para a AwesomeAPI; as chamadas ao servidor local seguem reais.
  const fetchOriginal = globalThis.fetch;
  const pedidosExternos = [];
  const segundos = String(Math.floor(Date.parse('2026-11-10T10:00:00.000Z') / 1000));
  globalThis.fetch = async (url, opcoes) => {
    if (!String(url).startsWith('https://economia.awesomeapi.com.br/')) return fetchOriginal(url, opcoes);
    pedidosExternos.push(new Headers(opcoes.headers));
    return Response.json(Object.fromEntries(Object.entries(cotacoesFixas).map(([code, { bid, ask }]) =>
      [code + 'BRL', { code, codein: 'BRL', bid, ask, timestamp: segundos, pctChange: '0.5' }])));
  };
  const chaveAnterior = process.env.AWESOMEAPI_KEY;
  process.env.AWESOMEAPI_KEY = 'chave-de-teste';
  const diretorio = await mkdtemp(path.join(tmpdir(), 'cambiotrack-fonte-'));
  const db = abrirBanco(path.join(diretorio, 'carteira.sqlite'));
  const servidor = createApp({ db, jwtSecret: randomBytes(32).toString('hex') }).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  t.after(async () => {
    globalThis.fetch = fetchOriginal;
    if (chaveAnterior === undefined) delete process.env.AWESOMEAPI_KEY;
    else process.env.AWESOMEAPI_KEY = chaveAnterior;
    await new Promise(resolve => servidor.close(resolve));
    db.close();
    await rm(diretorio, { recursive: true, force: true });
  });
  const base = 'http://127.0.0.1:' + servidor.address().port + '/api';
  const primeira = await requisitar(base, 'GET', '/cotacoes', 200);
  const segunda = await requisitar(base, 'GET', '/cotacoes', 200);
  assert.deepEqual(segunda, primeira);
  assert.equal(primeira.USD.bid, cotacoesFixas.USD.bid);
  assert.equal(primeira.USD.data, '2026-11-10T10:00:00.000Z');
  assert.equal(pedidosExternos.length, 1);
  assert.equal(pedidosExternos[0].get('x-api-key'), 'chave-de-teste');
});

// O banco recusa apagar uma conta que tem operações, e uma falha de escrita responde
// 500 genérico sem perder o que já estava salvo.
test('SQLite impede registros órfãos e falhas de escrita preservam a carteira', async t => {
  const api = await ambiente(t);
  const { token, usuario } = await cadastrarEEntrar(api);
  const salva = await api.req('POST', '/transacoes', 201, compra, token);
  const excluirDono = api.db.prepare('DELETE FROM usuarios WHERE id = ?');
  assert.throws(() => excluirDono.run(usuario.id), { errcode: 787 }); // SQLITE_CONSTRAINT_FOREIGNKEY

  // Altera somente a conexão temporária deste teste. Leituras seguem disponíveis.
  api.db.exec('PRAGMA query_only = ON');
  const falha = await api.req('POST', '/transacoes', 500, venda, token);
  assert.deepEqual(falha, { erro: 'Falha interna ao processar a solicitação.' });
  assert.deepEqual(await api.req('GET', '/transacoes', 200, undefined, token), [salva]);
});
