// ==========================================================================
// BANCO DE DADOS (SQLite)
// Este arquivo abre o arquivo do banco e cria as tabelas na primeira execução.
// O SQLite guarda tudo em um único arquivo no disco. Por isso as operações
// continuam salvas depois que o navegador é fechado ou a API é reiniciada.
// O módulo node:sqlite já vem com o Node.js: não é preciso instalar um servidor de banco.
// ==========================================================================
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync } = require('node:fs');
const path = require('node:path');

/**
 * Abre (ou cria) o banco e garante que as tabelas existam.
 * @param {string} filename Caminho do arquivo. Usa DB_PATH do .env ou backend/data/cambio.sqlite.
 *                          ':memory:' cria um banco temporário na memória (a API não usa essa
 *                          opção, e os testes usam arquivos temporários).
 * @returns {DatabaseSync} Conexão pronta para consultas.
 */
function abrirBanco(filename = process.env.DB_PATH || path.join(__dirname, 'data', 'cambio.sqlite')) {
  // Cria a pasta do arquivo (por exemplo, backend/data) caso ainda não exista.
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  try {
    // O texto SQL abaixo é executado de uma vez:
    // - PRAGMA foreign_keys liga a verificação de chave estrangeira (vale para cada conexão).
    // - PRAGMA busy_timeout faz o SQLite esperar até 5 s se o arquivo estiver ocupado.
    // - BEGIN/COMMIT criam a estrutura como um bloco único: ou tudo é criado, ou nada.
    // - "IF NOT EXISTS" preserva os dados já gravados quando o servidor é iniciado de novo.
    // - STRICT obriga cada coluna a receber exatamente o tipo declarado.
    //
    // Tabela usuarios: uma linha por conta. "email ... UNIQUE" faz o banco recusar
    // e-mails repetidos. senha_hash guarda só o resultado do Bcrypt, nunca a senha.
    //
    // Tabela transacoes: uma linha por simulação registrada.
    // - usuario_id é a chave estrangeira (REFERENCES usuarios): toda operação pertence
    //   a uma conta existente, e uma conta não pode ser apagada deixando operações órfãs.
    // - Os CHECK são regras de validação dentro do próprio banco: tipo só COMPRA/VENDA,
    //   ativo só USD/EUR/BTC, spread de 1%, bruto e líquido maiores que zero, taxa nunca
    //   negativa (fica zero quando o bruto é de até R$ 0,49) e líquido = bruto − taxa.
    // - Os valores em reais ficam em centavos inteiros (bruto, taxa e líquido), o que evita
    //   erros de arredondamento. montante, cotacao e quantidade_ativo ficam como texto
    //   para guardar exatamente as casas decimais (o BTC usa oito).
    // - O último CHECK amarra as moedas ao sentido: na COMPRA sai BRL e entra o ativo;
    //   na VENDA sai o ativo e entra BRL.
    // - status começa em ATIVA; o cancelamento muda para CANCELADA sem apagar a linha.
    // - data_cotacao é o horário informado pela AwesomeAPI; criado_em, o horário do registro.
    //
    // O índice funciona como o índice de um livro: acelera a busca das operações de um
    // usuário, já na ordem da mais nova para a mais antiga.
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
    // Se algo der errado, fecha o arquivo antes de avisar quem chamou a função.
    db.close();
    throw erro;
  }
}

module.exports = { abrirBanco };
