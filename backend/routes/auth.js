// ==========================================================================
// ROTAS DE CONTA: cadastro, login e perfil
//   POST /api/auth/register → cria a conta (senha guardada como hash Bcrypt)
//   POST /api/auth/login    → confere e-mail e senha e devolve um token JWT
//   GET  /api/auth/me       → informa de quem é o token enviado (rota protegida)
// ==========================================================================
const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const { emitirToken } = require('../middleware/auth');

/**
 * Monta o grupo de rotas de conta.
 * @param {DatabaseSync} db Conexão SQLite.
 * @param {string} segredo JWT_SECRET usada para assinar os tokens.
 * @param {Function} autenticar Middleware que exige um token válido.
 * @returns {express.Router} Rotas que o server.js publica em /api/auth.
 */
function rotasAuth(db, segredo, autenticar) {
  const router = express.Router();
  // Consultas preparadas: os valores entram pelos "?" e nunca são misturados ao texto
  // do SQL. Isso impede o ataque conhecido como injeção de SQL.
  const inserir = db.prepare('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?) RETURNING id, nome, email, criado_em');
  const consultar = db.prepare('SELECT id, nome, email, senha_hash, criado_em FROM usuarios WHERE email = ?');
  // Hash usado quando o e-mail não existe. Assim o login leva o mesmo tempo para
  // e-mails cadastrados e não cadastrados, sem revelar quais contas existem.
  const hashDescartavel = bcrypt.hashSync('comparacao-interna', 10);

  // CADASTRO -----------------------------------------------------------------
  router.post('/register', async (req, res) => {
    const { nome, email, senha } = req.body || {};
    // Remove espaços das pontas e padroniza o e-mail em minúsculas.
    const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
    const emailLimpo = typeof email === 'string' ? email.trim().toLowerCase() : '';
    // 400 = dados inválidos. Nome de 2 a 100 caracteres e e-mail no formato nome@dominio.algo.
    if (nomeLimpo.length < 2 || nomeLimpo.length > 100 || emailLimpo.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ erro: 'Informe um nome de 2 a 100 caracteres e um e-mail válido.' });
    }
    // O Bcrypt só considera os primeiros 72 bytes da senha. Recusar senhas maiores evita
    // que duas senhas diferentes, com o mesmo começo, sejam aceitas como iguais.
    if (typeof senha !== 'string' || senha.length < 8 || Buffer.byteLength(senha) > 72) {
      return res.status(400).json({ erro: 'A senha precisa de pelo menos 8 caracteres e no máximo 72 bytes.' });
    }
    // O hash é uma "impressão digital" da senha que não pode ser revertida. O Bcrypt
    // mistura um valor aleatório (salt) e repete o cálculo 2^10 vezes (custo 10),
    // tornando muito lento adivinhar senhas por tentativa e erro.
    const hash = await bcrypt.hash(senha, 10);
    try {
      const usuario = inserir.get(nomeLimpo, emailLimpo, hash);
      // 201 = criado. A resposta não inclui a senha nem o hash.
      res.status(201).json({ usuario });
    } catch (erro) {
      // 2067 é o código do SQLite para violação de UNIQUE: o e-mail já existe.
      // A restrição do banco também protege dois cadastros enviados ao mesmo tempo.
      if (erro.errcode === 2067) return res.status(409).json({ erro: 'E-mail já cadastrado.' });
      // Outros erros seguem para o tratador geral do server.js (resposta 500).
      throw erro;
    }
  });

  // LIMITE DE TENTATIVAS -----------------------------------------------------
  // Cada endereço IP pode errar o login 10 vezes a cada 15 minutos. Logins bem-sucedidos
  // não contam. Depois disso a resposta é 429, o que atrasa quem tenta adivinhar senhas.
  const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' }
  });

  // LOGIN --------------------------------------------------------------------
  router.post('/login', limitarLogin, async (req, res) => {
    const { email, senha } = req.body || {};
    if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
      return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    }
    const conta = consultar.get(email.trim().toLowerCase());
    // bcrypt.compare calcula o hash da senha digitada e compara com o hash salvo.
    const confere = await bcrypt.compare(senha, conta?.senha_hash || hashDescartavel);
    // A mesma mensagem para e-mail inexistente e senha errada não revela qual dos dois falhou.
    if (!conta || !confere || Buffer.byteLength(senha) > 72) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }
    // Copiamos só os campos públicos: senha_hash nunca sai do servidor.
    const { id, nome, email: endereco, criado_em } = conta;
    const usuario = { id, nome, email: endereco, criado_em };
    res.json({ token: emitirToken(usuario, segredo), usuario });
  });

  // PERFIL (rota protegida) ----------------------------------------------------
  // "autenticar" roda antes e preenche req.usuario a partir do token.
  router.get('/me', autenticar, (req, res) => res.json({ usuario: req.usuario }));
  return router;
}

module.exports = { rotasAuth };
