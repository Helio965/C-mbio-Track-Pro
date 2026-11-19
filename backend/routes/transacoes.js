// ==========================================================================
// ROTAS DA CARTEIRA (todas exigem token JWT, verificado antes no server.js)
//   GET    /api/transacoes              → lista o histórico da conta
//   GET    /api/transacoes/resumo       → indicadores (total, ativas, volume)
//   POST   /api/transacoes/previa       → calcula uma simulação SEM gravar
//   POST   /api/transacoes              → calcula e GRAVA a simulação no SQLite
//   PATCH  /api/transacoes/:id/cancelar → marca como CANCELADA (continua no histórico)
//   DELETE /api/transacoes/:id          → apaga definitivamente
// ==========================================================================
const express = require('express');
const { calcular, validarEntrada } = require('../services/cambioService');

/**
 * Monta o grupo de rotas da carteira.
 * @param {DatabaseSync} db Conexão SQLite.
 * @param {Function} buscarCotacoes Função que obtém os preços atuais (AwesomeAPI).
 * @returns {express.Router} Rotas que o server.js publica em /api/transacoes.
 */
function rotasTransacoes(db, buscarCotacoes) {
  const router = express.Router();

  // CONSULTAS SQL ---------------------------------------------------------------
  // Toda consulta inclui "usuario_id = ?" preenchido com o dono do token. Assim uma
  // conta nunca lê, cancela ou apaga operações de outra, mesmo sabendo o número delas.
  const listar = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY id DESC');
  const localizar = db.prepare('SELECT status FROM transacoes WHERE id = ? AND usuario_id = ?');
  // Só uma operação ATIVA pode ser cancelada. RETURNING devolve a linha já atualizada.
  const cancelar = db.prepare(`
    UPDATE transacoes SET status = 'CANCELADA'
    WHERE id = ? AND usuario_id = ? AND status = 'ATIVA' RETURNING *
  `);
  const excluir = db.prepare('DELETE FROM transacoes WHERE id = ? AND usuario_id = ?');
  // Indicadores calculados pelo próprio banco:
  //   total = todas as operações; ativas = só as não canceladas;
  //   movimentado_centavos = soma do valor bruto (antes do spread) das ativas.
  const resumo = db.prepare(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'ATIVA') AS ativas,
           coalesce(sum(bruto_centavos) FILTER (WHERE status = 'ATIVA'), 0) AS movimentado_centavos
    FROM transacoes WHERE usuario_id = ?
  `);
  // Os nomes com "$" são preenchidos pelas propriedades do objeto calculado.
  const inserir = db.prepare(`
    INSERT INTO transacoes
      (usuario_id, tipo, ativo, moeda_origem, moeda_destino, montante, cotacao, spread,
       bruto_centavos, taxa_centavos, liquido_centavos, quantidade_ativo, data_cotacao)
    VALUES
      ($usuario_id, $tipo, $ativo, $moeda_origem, $moeda_destino, $montante, $cotacao, $spread,
       $bruto_centavos, $taxa_centavos, $liquido_centavos, $quantidade_ativo, $data_cotacao)
    RETURNING *
  `);

  // LEITURA (GET) -----------------------------------------------------------------
  // req.usuario foi preenchido pelo middleware de autenticação a partir do token.
  router.get('/', (req, res) => res.json(listar.all(req.usuario.id)));
  router.get('/resumo', (req, res) => res.json(resumo.get(req.usuario.id)));

  // CRIAÇÃO (POST) ------------------------------------------------------------------
  /**
   * Valida o formulário e calcula a operação com a cotação obtida pelo servidor.
   * A validação vem primeiro: um pedido inválido nem chega a consultar a AwesomeAPI.
   * A prévia e o registro usam exatamente esta mesma regra.
   * @param {object} body Corpo JSON com tipo, ativo e montante.
   * @returns {Promise<object>} Valores calculados, prontos para exibir ou gravar.
   */
  async function simular(body) {
    validarEntrada(body);
    return calcular(body, await buscarCotacoes());
  }
  // Prévia: devolve o cálculo e não grava nada.
  router.post('/previa', async (req, res) => res.json(await simular(req.body)));
  // Registro: grava a linha ligada ao dono do token e responde 201 (criado).
  // Se a cotação mudou desde a prévia, o registro usa o preço mais recente.
  router.post('/', async (req, res) => {
    const operacao = await simular(req.body);
    res.status(201).json(inserir.get({ ...operacao, usuario_id: req.usuario.id }));
  });

  // VALIDAÇÃO DO :id -----------------------------------------------------------------
  // Roda antes das rotas com ":id". Aceita só números inteiros positivos (1, 2, 3...).
  router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ erro: 'Identificador de operação inválido.' });
    }
    req.operacaoId = Number(id);
    next();
  });

  // ATUALIZAÇÃO (PATCH) ----------------------------------------------------------------
  router.patch('/:id/cancelar', (req, res) => {
    const registro = cancelar.get(req.operacaoId, req.usuario.id);
    if (registro) return res.json(registro);
    // Nada foi atualizado: ou a operação já estava cancelada (409 = conflito),
    // ou não existe nesta conta (404 = não encontrada).
    if (localizar.get(req.operacaoId, req.usuario.id)) {
      return res.status(409).json({ erro: 'Esta operação já está cancelada.' });
    }
    res.status(404).json({ erro: 'Operação não encontrada.' });
  });

  // EXCLUSÃO (DELETE) -------------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    // changes informa quantas linhas foram apagadas (0 = não existia nesta conta).
    const { changes } = excluir.run(req.operacaoId, req.usuario.id);
    if (!changes) return res.status(404).json({ erro: 'Operação não encontrada.' });
    // 204 = sucesso sem conteúdo na resposta.
    res.sendStatus(204);
  });
  return router;
}

module.exports = { rotasTransacoes };
