// ==========================================================================
// SESSÃO COM JWT (JSON Web Token)
// Depois do login, o servidor entrega ao navegador um "token": um texto assinado com
// a chave secreta JWT_SECRET, que só o servidor conhece. Nas próximas requisições o
// navegador devolve esse token no cabeçalho "Authorization: Bearer <token>".
// Se alguém alterar uma letra do token, a assinatura deixa de conferir e o acesso é negado.
// ==========================================================================
const jwt = require('jsonwebtoken');

// "Emissor" é o nome de quem criou o token. Tokens com outro emissor são recusados.
const emissor = 'cambio-track-pro';

/**
 * Cria o token de uma conta que acabou de fazer login.
 * O token guarda apenas o número da conta (sub), a data de criação da conta (criado_em),
 * o emissor (iss), a hora de emissão (iat) e o vencimento (exp), 1 hora depois.
 * Seu conteúdo pode ser lido por qualquer pessoa; por isso nunca colocamos a senha nele.
 * @param {{id: number, criado_em: string}} usuario Conta autenticada.
 * @param {string} segredo JWT_SECRET usada para assinar.
 * @returns {string} Token no formato cabeçalho.conteúdo.assinatura.
 */
function emitirToken(usuario, segredo) {
  return jwt.sign({ criado_em: usuario.criado_em }, segredo, {
    algorithm: 'HS256', issuer: emissor, subject: String(usuario.id), expiresIn: '1h'
  });
}

/**
 * Cria o "middleware" que protege as rotas privadas. Um middleware é uma função que o
 * Express executa antes da rota: aqui ela confere o token e descobre quem fez o pedido.
 * @param {DatabaseSync} db Conexão SQLite, usada para confirmar que a conta ainda existe.
 * @param {string} segredo JWT_SECRET usada para conferir a assinatura.
 * @returns {Function} Função (req, res, next) que libera ou bloqueia a requisição.
 */
function exigirUsuario(db, segredo) {
  // Consulta preparada uma única vez; o "?" é preenchido com o número da conta.
  const buscar = db.prepare('SELECT id, nome, email, criado_em FROM usuarios WHERE id = ?');
  return (req, res, next) => {
    // Extrai o token do cabeçalho "Authorization: Bearer <token>".
    const token = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') || '')?.[1];
    let id;
    let criadoEm;
    try {
      // verify confere a assinatura, aceita somente HS256 e o nosso emissor, e
      // recusa tokens vencidos. Qualquer problema lança um erro e cai no catch.
      const claims = jwt.verify(token, segredo, { algorithms: ['HS256'], issuer: emissor });
      id = Number(claims.sub);
      criadoEm = claims.criado_em;
      // Exigimos validade (exp), um número de conta inteiro e positivo e a data de criação.
      if (!claims.exp || !Number.isSafeInteger(id) || id < 1 || typeof criadoEm !== 'string') throw new Error();
    } catch {
      // 401 = não autenticado. O painel usa esse código para voltar à tela de login.
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
    }
    // A conta precisa continuar existindo e ser a mesma que recebeu o token. Se o banco for
    // apagado e recriado, outra pessoa pode receber o mesmo número de conta; a data de
    // criação diferente impede que o token antigo abra a carteira dela.
    req.usuario = buscar.get(id);
    if (!req.usuario || req.usuario.criado_em !== criadoEm) {
      return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' });
    }
    // Tudo certo: segue para a rota, que agora sabe quem é o usuário (req.usuario).
    next();
  };
}

module.exports = { emitirToken, exigirUsuario };
