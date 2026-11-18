const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('node:path');
const { abrirBanco } = require('./database');
const { exigirUsuario } = require('./middleware/auth');
const { rotasAuth } = require('./routes/auth');
const { rotasTransacoes } = require('./routes/transacoes');
const { buscarCotacoes: consultarAwesome } = require('./services/cotacoes');

const origensPadrao = 'http://localhost:5173,http://127.0.0.1:5173';
function createApp({ db, jwtSecret, buscarCotacoes = consultarAwesome,
                     frontendOrigins = process.env.FRONTEND_ORIGINS || origensPadrao }) {
  if (typeof jwtSecret !== 'string' || Buffer.byteLength(jwtSecret.trim()) < 32) {
    throw new Error('Configure JWT_SECRET com pelo menos 32 bytes.');
  }
  const origens = new Set(frontendOrigins.split(',').map(valor => valor.trim()).filter(Boolean));
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { upgradeInsecureRequests: null } } }));

  // A página pode usar este próprio host ou um dos servidores de interface configurados.
  // CORS é uma política de navegador. O controle dos dados depende sempre do JWT.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origem = req.get('origin');
    if (!origem) return next();
    let mesmoHost = false;
    try {
      const url = new URL(origem);
      mesmoHost = ['http:', 'https:'].includes(url.protocol) && url.host === req.get('host');
    } catch { /* Uma origem inválida também será recusada. */ }
    if (!mesmoHost && !origens.has(origem)) {
      return res.status(403).json({ erro: 'Origem não autorizada.' });
    }
    return cors({ origin: origem, methods: ['GET','POST','PATCH','DELETE'],
      allowedHeaders: ['Authorization','Content-Type'] })(req, res, next);
  });
  app.use('/api', express.json({ limit: '16kb' }));
  const autenticar = exigirUsuario(db, jwtSecret);
  app.use('/api/auth', rotasAuth(db, jwtSecret, autenticar));
  app.get('/api/cotacoes', async (_req, res) => res.json(await buscarCotacoes()));
  app.use('/api/transacoes', autenticar, rotasTransacoes(db, buscarCotacoes));

  // Também é possível usar um único endereço para o painel e a API.
  const front = path.join(__dirname, '..', 'frontend');
  app.use('/js', express.static(path.join(front, 'js')));
  app.use('/css', express.static(path.join(front, 'css')));
  app.get(['/', '/index.html'], (_req, res) => res.sendFile(path.join(front, 'index.html')));
  app.get('/login.html', (_req, res) => res.sendFile(path.join(front, 'login.html')));
  app.use((_req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' }));

  // No Express 5, exceções e rejeições de rotas async chegam a este middleware.
  app.use((erro, _req, res, next) => {
    if (res.headersSent) return next(erro);
    if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Corpo da requisição muito grande.' });
    if (erro.type === 'charset.unsupported' || erro.type === 'encoding.unsupported') {
      return res.status(415).json({ erro: 'Codificação do corpo da requisição não suportada.' });
    }
    if ([400, 502, 503, 504].includes(erro.status) && !erro.type) {
      return res.status(erro.status).json({ erro: erro.message });
    }
    // Registra a categoria sem revelar SQL, cabeçalhos de autorização ou dados do usuário.
    console.error('Falha ao atender requisição.', erro.code || erro.name);
    res.status(500).json({ erro: 'Falha interna ao processar a solicitação.' });
  });
  return app;
}

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
    console.error('Falha ao abrir a porta do servidor.', erro.code);
    db.close();
    process.exitCode = 1;
  });
  // Ao encerrar, terminamos as requisições pendentes antes de fechar a conexão SQLite.
  const encerrar = () => servidor.close(() => db.close());
  process.once('SIGINT', encerrar);
  process.once('SIGTERM', encerrar);
}

if (require.main === module) {
  try {
    iniciar();
  } catch (erro) {
    console.error('Falha ao iniciar o servidor.', erro.message);
    process.exitCode = 1;
  }
}
module.exports = { createApp };
