const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

// Um arquivo contém toda a carteira. As conexões em memória ficam reservadas aos testes.
function abrirBanco(filename = process.env.DB_PATH || path.join(__dirname, 'data', 'cambio.sqlite')) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    // A chave estrangeira impede transações órfãs. O SQLite aplica essa regra por conexão.
    db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      BEGIN;
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ) STRICT;
      CREATE TABLE IF NOT EXISTS transacoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
        tipo TEXT NOT NULL CHECK (tipo IN ('COMPRA','VENDA')),
        ativo TEXT NOT NULL CHECK (ativo IN ('USD','EUR','BTC')),
        moeda_origem TEXT NOT NULL,
        moeda_destino TEXT NOT NULL,
        montante TEXT NOT NULL,
        cotacao TEXT NOT NULL,
        spread REAL NOT NULL CHECK (spread = 0.01),
        bruto_centavos INTEGER NOT NULL CHECK (bruto_centavos > 0),
        taxa_centavos INTEGER NOT NULL CHECK (taxa_centavos >= 0),
        liquido_centavos INTEGER NOT NULL CHECK (liquido_centavos > 0 AND liquido_centavos = bruto_centavos - taxa_centavos),
        quantidade_ativo TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ATIVA' CHECK (status IN ('ATIVA','CANCELADA')),
        data_cotacao TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        CHECK ((tipo = 'COMPRA' AND moeda_origem = 'BRL' AND moeda_destino = ativo)
            OR (tipo = 'VENDA' AND moeda_origem = ativo AND moeda_destino = 'BRL'))
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_id ON transacoes(usuario_id, id DESC);
      COMMIT;
    `);
    return db;
  } catch (erro) {
    db.close();
    throw erro;
  }
}

module.exports = { abrirBanco };
