const express = require('express');
const bcrypt = require('bcrypt');
const { rateLimit } = require('express-rate-limit');
const { emitirToken } = require('../middleware/auth');

function rotasAuth(db, segredo, autenticar) {
  const router = express.Router();
  const inserir = db.prepare('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?) RETURNING id, nome, email, criado_em');
  const consultar = db.prepare('SELECT id, nome, email, senha_hash, criado_em FROM usuarios WHERE email = ?');
  // Uniformiza o custo da comparação mesmo para endereços não cadastrados.
  const hashDescartavel = bcrypt.hashSync('comparacao-interna', 10);

  router.post('/register', async (req, res) => {
    const { nome, email, senha } = req.body || {};
    const nomeLimpo = typeof nome === 'string' ? nome.trim() : '';
    const emailLimpo = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (nomeLimpo.length < 2 || nomeLimpo.length > 100 || emailLimpo.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
      return res.status(400).json({ erro: 'Informe um nome de 2 a 100 caracteres e um e-mail válido.' });
    }
    // Bcrypt usa até 72 bytes. Bloquear entradas maiores evita senhas truncadas.
    if (typeof senha !== 'string' || senha.length < 8 || Buffer.byteLength(senha) > 72) {
      return res.status(400).json({ erro: 'A senha precisa de pelo menos 8 caracteres e no máximo 72 bytes.' });
    }
    const hash = await bcrypt.hash(senha, 10);
    try {
      const usuario = inserir.get(nomeLimpo, emailLimpo, hash);
      res.status(201).json({ usuario });
    } catch (erro) {
      // A restrição UNIQUE também protege dois cadastros simultâneos.
      if (erro.errcode === 2067) return res.status(409).json({ erro: 'E-mail já cadastrado.' });
      throw erro;
    }
  });

  const limitarLogin = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { erro: 'Muitas tentativas de login. Aguarde 15 minutos.' }
  });
  router.post('/login', limitarLogin, async (req, res) => {
    const { email, senha } = req.body || {};
    if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
      return res.status(400).json({ erro: 'Informe e-mail e senha.' });
    }
    const conta = consultar.get(email.trim().toLowerCase());
    const confere = await bcrypt.compare(senha, conta?.senha_hash || hashDescartavel);
    if (!conta || !confere || Buffer.byteLength(senha) > 72) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
    }
    const { id, nome, email: endereco, criado_em } = conta;
    const usuario = { id, nome, email: endereco, criado_em };
    res.json({ token: emitirToken(usuario, segredo), usuario });
  });

  router.get('/me', autenticar, (req, res) => res.json({ usuario: req.usuario }));
  return router;
}

module.exports = { rotasAuth };
