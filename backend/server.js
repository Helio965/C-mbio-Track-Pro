// ==========================================================================
// SERVIDOR DA API (Node.js + Express)
// Ponto de entrada do back-end. Este arquivo:
//   1. aplica cabeçalhos de segurança e a política de origens (CORS);
//   2. transforma o corpo JSON das requisições em objeto JavaScript;
//   3. liga as rotas de conta (/api/auth) e da carteira (/api/transacoes);
//   4. responde todos os erros em JSON, no formato { "erro": "mensagem" };
//   5. abre o SQLite e começa a ouvir a porta 3000 (npm start).
// ==========================================================================
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('node:path');
const { abrirBanco } = require('./database');
const { exigirUsuario } = require('./middleware/auth');
const { rotasAuth } = require('./routes/auth');
const { rotasTransacoes } = require('./routes/transacoes');
const { buscarCotacoes: consultarAwesome, criarConsultaComCache } = require('./services/cotacoes');

// Endereços do front-end que podem chamar a API pelo navegador (servidor da porta 5173).
const origensPadrao = 'http://localhost:5173,http://127.0.0.1:5173';

/**
 * Monta a aplicação Express sem abrir a porta. Os testes automáticos usam esta função
 * com um banco temporário e cotações controladas.
 * @param {object} opcoes
 * @param {DatabaseSync} opcoes.db Conexão SQLite já aberta.
 * @param {string} opcoes.jwtSecret Chave secreta dos tokens (mínimo de 32 bytes).
 * @param {Function} opcoes.buscarCotacoes Fonte de preços. Padrão: AwesomeAPI com reaproveitamento de 30 s.
 * @param {string} opcoes.frontendOrigins Origens autorizadas, separadas por vírgula.
 * @returns {express.Application}
 */
function createApp({ db, jwtSecret, buscarCotacoes = criarConsultaComCache(consultarAwesome),
                     frontendOrigins = process.env.FRONTEND_ORIGINS || origensPadrao }) {
  // Sem uma chave longa, qualquer pessoa poderia forjar tokens. O servidor nem inicia.
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret.trim()) < 32) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 bytes.');
  }
  const origens = new Set(frontendOrigins.split(',').map(valor => valor.trim()).filter(Boolean));
  const app = express();
  // Não anuncia "Express" nas respostas e aplica cabeçalhos de proteção do Helmet.
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));

  // CORS: o navegador só deixa uma página de outra origem (ex.: porta 5173) ler as
  // respostas desta API (porta 3000) se o servidor autorizar aquela origem.
  // A página pode usar este próprio host ou um dos servidores de interface configurados.
  // CORS é uma política de navegador. O controle dos dados depende sempre do JWT.
  app.use('/api', (req, res, next) => {
    // Respostas da API nunca ficam guardadas em cache, pois contêm dados da carteira.
    res.set('Cache-Control', 'no-store');
    const origem = req.get('origin');
    // Sem cabeçalho Origin (terminal, testes ou GET feito pela própria página): segue normalmente.
    // POST, PATCH e DELETE da própria página trazem Origin e são liberados pela comparação de host abaixo.
    if (!origem) return next();
    let mesmoHost = false;
    try {
      const url = new URL(origem);
      mesmoHost = ['http:', 'https:'].includes(url.protocol) && url.host === req.get('host');
    } catch { /* Uma origem inválida também será recusada. */ }
    // Origem desconhecida: 403 (proibido) e nenhum cabeçalho de liberação.
    if (!mesmoHost && !origens.has(origem)) {
      return res.status(403).json({ erro: 'Origem não autorizada.' });
    }
    // Origem autorizada: libera os métodos usados pelo painel e o cabeçalho do token.
    return cors({ origin: origem, methods: ['GET','POST','PATCH','DELETE'],
      allowedHeaders: ['Authorization','Content-Type'] })(req, res, next);
  });
  // Lê corpos JSON de até 16 kB e os coloca em req.body.
  app.use('/api', express.json({ limit: '16kb' }));
  const autenticar = exigirUsuario(db, jwtSecret);
  // Rotas de conta: cadastro e login são públicos; /me exige token.
  app.use('/api/auth', rotasAuth(db, jwtSecret, autenticar));
  // Cotações são públicas: não envolvem dados de nenhuma conta.
  app.get('/api/cotacoes', async (_req, res) => res.json(await buscarCotacoes()));
  // Toda a carteira passa antes por "autenticar": sem token válido, resposta 401.
  app.use('/api/transacoes', autenticar, rotasTransacoes(db, buscarCotacoes));

  // Também é possível usar um único endereço para o painel e a API.
  const front = path.join(__dirname, '..', 'frontend');
  app.use('/js', express.static(path.join(front, 'js')));
  app.use('/css', express.static(path.join(front, 'css')));
  app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(front, 'index.html')));
  app.get('/login.html', (_req, res) => res.sendFile(path.join(front, 'login.html')));
  // Qualquer outro endereço: 404 em JSON.
  app.use((_req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' }));

  // TRATAMENTO CENTRAL DE ERROS (equivale a um try/catch para todas as rotas).
  // No Express 5, exceções e rejeições de rotas async chegam a este middleware.
  app.use((erro, _req, res, next) => {
    if (res.headersSent) return next(erro);
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Corpo da requisição muito grande.' });
    if (erro.type === 'charset.unsupported' || erro.type === 'encoding.unsupported') {
      return res.status(415).json({ erro: 'Codificação do corpo da requisição não suportada.' });
    }
    // Erros 400/502/503/504 sem "type" têm a mensagem repassada. Os criados pelo código
    // (dados inválidos, fonte externa fora do ar ou lenta) já vêm em português; o próprio
    // Express também gera 400 ao receber um :id malformado na URL (mensagem técnica, em inglês).
    if ([400, 502, 503, 504].includes(erro.status) && !erro.type) {
      return res.status(erro.status).json({ erro: erro.message });
    }
    // Erro inesperado (ex.: banco ocupado): 500 com mensagem genérica.
    // Registra a categoria sem revelar SQL, cabeçalhos de autorização ou dados do usuário.
    console.error('Falha ao atender requisição.', erro.code || erro.name);
    res.status(500).json({ erro: 'Falha interna ao processar a solicitação.' });
  });
  return app;
}

/** Lê as configurações do ambiente (.env), abre o banco e inicia o servidor HTTP. */
function iniciar() {
  const porta = Number(process.env.PORT || 3000);
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) throw new Error('PORT inválida.');
  const db = abrirBanco();
  let app;
  try {
    app = createApp({ db, jwtSecret: process.env.JWT_SECRET });
  } catch (erro) {
    db.close();
    throw erro;
  }
  const servidor = app.listen(porta, '0.0.0.0', () => console.log('Câmbio Track Pro na porta', porta));
  servidor.on('error', erro => {
    // Exemplo: EADDRINUSE quando outra API já está usando a porta.
    console.error('Falha ao abrir a porta do servidor.', erro.code);
    db.close();
    process.exitCode = 1;
  });
  // Ao encerrar (Ctrl+C), terminamos as requisições pendentes antes de fechar a conexão SQLite.
  const encerrar = () => servidor.close(() => db.close());
  process.once('SIGINT', encerrar);
  process.once('SIGTERM', encerrar);
}

// Só inicia o servidor quando o arquivo é executado diretamente (npm start).
// Quando os testes importam createApp, nada é iniciado automaticamente.
if (require.main === module) {
  try {
    iniciar();
  } catch (erro) {
    console.error('Falha ao iniciar o servidor.', erro.message);
    process.exitCode = 1;
  }
}
module.exports = { createApp };
