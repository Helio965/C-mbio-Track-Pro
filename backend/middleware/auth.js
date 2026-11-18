const jwt = require('jsonwebtoken');
const emissor = 'cambio-track-pro';

function emitirToken(usuario, segredo) {
  // O token assinado identifica a conta. Seu conteúdo pode ser lido pelo cliente.
  return jwt.sign({}, segredo, {
    algorithm: 'HS256', issuer: emissor, subject: String(usuario.id), expiresIn: '1h'
  });
}

function exigirUsuario(db, segredo) {
  const buscar = db.prepare('SELECT id, nome, email, criado_em FROM usuarios WHERE id = ?');
  return (req, res, next) => {
    const token = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '')?.[1];
    let id;
    try {
      const claims = jwt.verify(token, segredo, { algorithms: ['HS256'], issuer: emissor });
      id = Number(claims.sub);
      if (!claims.exp || !Number.isSafeInteger(id) || id < 1) throw new Error();
    } catch {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
    }
    // A conta precisa continuar existindo, inclusive quando a assinatura é válida.
    req.usuario = buscar.get(id);
    if (!req.usuario) return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
    next();
  };
}

module.exports = { emitirToken, exigirUsuario };
