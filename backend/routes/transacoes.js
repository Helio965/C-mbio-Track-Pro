const express = require('express');
const { calcular, validarEntrada } = require('../services/cambioService');

function rotasTransacoes(db, buscarCotacoes) {
  const router = express.Router();
  // O SELECT e cada alteração usam o dono do JWT como parte do filtro.
  const listar = db.prepare('SELECT * FROM transacoes WHERE usuario_id = ? ORDER BY id DESC');
  const localizar = db.prepare('SELECT status FROM transacoes WHERE id = ? AND usuario_id = ?');
  const cancelar = db.prepare(`
    UPDATE transacoes SET status = 'CANCELADA'
    WHERE id = ? AND usuario_id = ? AND status = 'ATIVA' RETURNING *
  `);
  const excluir = db.prepare('DELETE FROM transacoes WHERE id = ? AND usuario_id = ?');
  const resumo = db.prepare(`
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status = 'ATIVA') AS ativas,
           coalesce(sum(bruto_centavos) FILTER (WHERE status = 'ATIVA'), 0) AS movimentado_centavos
    FROM transacoes WHERE usuario_id = ?
  `);
  const inserir = db.prepare(`
    INSERT INTO transacoes
      (usuario_id, tipo, ativo, moeda_origem, moeda_destino, montante, cotacao, spread,
       bruto_centavos, taxa_centavos, liquido_centavos, quantidade_ativo, data_cotacao)
    VALUES
      ($usuario_id, $tipo, $ativo, $moeda_origem, $moeda_destino, $montante, $cotacao, $spread,
       $bruto_centavos, $taxa_centavos, $liquido_centavos, $quantidade_ativo, $data_cotacao)
    RETURNING *
  `);

  router.get('/', (req, res) => res.json(listar.all(req.usuario.id)));
  router.get('/resumo', (req, res) => res.json(resumo.get(req.usuario.id)));

  // A prévia e a gravação usam a mesma regra. Uma cotação posterior pode mudar o resultado.
  async function simular(body) {
    validarEntrada(body);
    return calcular(body, await buscarCotacoes());
  }
  router.post('/previa', async (req, res) => res.json(await simular(req.body)));
  router.post('/', async (req, res) => {
    const operacao = await simular(req.body);
    res.status(201).json(inserir.get({ ...operacao, usuario_id: req.usuario.id }));
  });

  router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return res.status(400).json({ erro: 'Identificador de operação inválido.' });
    }
    req.operacaoId = Number(id);
    next();
  });

  router.patch('/:id/cancelar', (req, res) => {
    const registro = cancelar.get(req.operacaoId, req.usuario.id);
    if (registro) return res.json(registro);
    if (localizar.get(req.operacaoId, req.usuario.id)) {
      return res.status(409).json({ erro: 'Esta operação já está cancelada.' });
    }
    res.status(404).json({ erro: 'Operação não encontrada.' });
  });
  router.delete('/:id', (req, res) => {
    const { changes } = excluir.run(req.operacaoId, req.usuario.id);
    if (!changes) return res.status(404).json({ erro: 'Operação não encontrada.' });
    res.sendStatus(204);
  });
  return router;
}

module.exports = { rotasTransacoes };
