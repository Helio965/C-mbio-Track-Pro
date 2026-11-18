# Câmbio Track Pro

**Projeto 02 de Desenvolvimento Web · CEUB · 2º semestre de 2026**

**Opção B — Carteira de Investimentos**

Simule uma venda de dólar, euro ou bitcoin para receber reais, ou uma compra desses ativos usando reais. A carteira mantém o preço usado em cada registro. Você pode fechar o navegador, reiniciar a API e entrar novamente para consultar suas operações.

O painel evolui o CâmbioTrack do Projeto 01. Mantém os três pares com BRL, a atualização manual de cotações, a prévia, o spread de 1%, os indicadores e os cartões de histórico. O Projeto 02 acrescenta contas individuais, operações de compra, exclusão de registros e persistência em SQLite.

## Executar em dois terminais

Use **Node.js 24 LTS**, a partir da versão **24.15.0** (validado com 24.22.1), npm, um navegador moderno e acesso HTTPS à AwesomeAPI para obter preços. O SQLite já acompanha essa versão do Node. Abra os dois terminais na pasta que contém este README.

**Terminal 1 — API Express**

```sh
cd backend
npm ci
node -e "const fs=require('node:fs'); const chave=require('node:crypto').randomBytes(48).toString('hex'); fs.writeFileSync('.env','JWT_SECRET='+chave+'\n',{flag:'wx',mode:0o600})"
npm start
```

Execute o comando de geração da chave uma vez por instalação. Ele cria `backend/.env` com uma chave aleatória privada. Se o arquivo já existir, confira sua configuração antes de iniciar. Para configurar manualmente, use `backend/.env.example` como modelo e defina `JWT_SECRET` com pelo menos 32 bytes. Para recarregar o servidor durante edições, use `npm run dev`.

| Variável do back-end | Uso |
| --- | --- |
| `JWT_SECRET` | Chave privada do servidor para assinar e validar sessões. Mantenha a mesma chave nos reinícios para validar sessões ainda vigentes. |
| `PORT` | Porta HTTP da API. O padrão é `3000`. |
| `DB_PATH` | Caminho do arquivo SQLite. O padrão é `backend/data/cambio.sqlite`. O processo precisa poder escrever nesse diretório. |
| `FRONTEND_ORIGINS` | Origens de navegador autorizadas, separadas por vírgula. O desenvolvimento usa `http://localhost:5173` e `http://127.0.0.1:5173`. |

**Terminal 2 — interface HTML, CSS e JavaScript**

```sh
cd frontend
npm ci
npm start
```

Abra **http://localhost:5173**. O servidor do front-end entrega os arquivos estáticos. No fluxo de desenvolvimento, o navegador envia requisições para a API em **http://localhost:3000/api**. Mantenha a porta padrão do back-end ao usar esse fluxo. O Node executa o servidor de arquivos, e o JavaScript do painel roda no navegador.

## Usar a carteira

1. Abra o cadastro, informe nome, e-mail, senha e confirmação. Use uma senha de pelo menos oito caracteres e até 72 bytes. Entre com o e-mail e a senha da conta.
2. Consulte os preços de USD, EUR e BTC e o horário informado pela fonte. Use o botão de atualização para consultar a fonte novamente.
3. Selecione compra ou venda, escolha o ativo e informe o montante. Na compra, informe **reais disponíveis**. Na venda, informe **unidades do ativo**. Confira o preço, o bruto, a taxa e o resultado na prévia.
4. Registre a simulação. O servidor consulta a cotação usada para o registro e devolve os valores definitivos. Uma mudança de preço entre a prévia e o registro pode alterar o resultado.
5. Consulte o histórico. Cancelar preserva o cartão e retira a operação dos totais ativos. Excluir remove o registro. Sair encerra a sessão na aba. Ao entrar de novo, a API carrega a carteira da conta.
6. Para verificar a persistência, registre uma operação, anote seu valor e horário e feche o navegador. Encerre e reinicie o back-end com o mesmo `DB_PATH`. Abra o front-end, entre na mesma conta e localize a operação.

## Arquivos do projeto

```text
CambioTrack-Pro/
├── .gitignore
├── README.md
├── backend/
│   ├── .gitignore, .env.example
│   ├── package.json, package-lock.json
│   ├── server.js                 # Express, CORS, erros e inicialização
│   ├── database.js               # Conexão, tabelas e índice SQLite
│   ├── middleware/auth.js        # Emissão e verificação do JWT
│   ├── routes/                   # Cadastro, login e carteira individual
│   ├── services/                 # Preços externos, validação e cálculos
│   └── tests/                    # Testes HTTP, banco, cálculos e falhas
├── frontend/
│   ├── .gitignore
│   ├── package.json, package-lock.json
│   ├── server.js                 # Servidor estático para desenvolvimento
│   ├── index.html, login.html
│   ├── css/style.css
│   └── js/                       # Fetch, sessão, formulários e DOM
└── docs/
    ├── ENTENDIMENTO_TECNICO.md
    └── AUDITORIA.md
```

O banco é criado ao iniciar a API. `usuarios` guarda identificação, e-mail único, hash Bcrypt e data de criação. A chave estrangeira `transacoes.usuario_id` liga cada simulação a uma conta. No registro ficam a direção, o ativo, as moedas, o montante, a cotação com sua data, o spread, os três valores em centavos de real, a quantidade do ativo, o status e a data de criação. Preços novos só influenciam novas simulações.

## Regras de cálculo

O par ativo/BRL expressa o **preço em reais de uma unidade** do ativo. `bid` é o quanto a contraparte paga ao comprar o ativo do usuário. `ask` é o que cobra ao vendê-lo ao usuário.

| Operação | Bruto em reais | Taxa e líquido em reais | Resultado para o usuário |
| --- | --- | --- | --- |
| VENDA | montante em ativo × `bid`, arredondado em centavos | taxa = 1% do bruto arredondada em centavos. Líquido = bruto − taxa | Recebe o líquido em BRL |
| COMPRA | orçamento informado em BRL | mesma regra | Obtém líquido ÷ `ask` unidades de ativo, truncadas na precisão do ativo |

USD e EUR admitem duas casas decimais e BTC admite oito. A entrada em BRL admite duas. O montante pode chegar a um bilhão de unidades, o bruto deve ficar entre R$ 0,01 e R$ 1 bilhão e a quantidade resultante deve ser positiva e respeitar o limite. A compra descarta a fração menor que a unidade mínima representável. O **volume movimentado** soma o bruto em BRL das compras e das vendas ativas. Trata-se de volume de simulações, sem representar saldo disponível ou rentabilidade.

## API REST

Todos os caminhos abaixo começam em `/api`. Envie JSON com `Content-Type: application/json` quando houver corpo. Nas rotas privadas envie `Authorization: Bearer <token>`. Os valores `*_centavos` são inteiros. Campos como `cotacao` e `quantidade_ativo` conservam a representação decimal em texto.

| Método e caminho | JWT | Corpo ou efeito | Sucesso |
| --- | --- | --- | --- |
| `POST /auth/register` | Livre | `nome`, `email`, `senha` | 201, usuário público |
| `POST /auth/login` | Livre | `email`, `senha` | 200, `token` e `usuario` |
| `GET /auth/me` | Sim | Identificação da sessão | 200, `usuario` |
| `GET /cotacoes` | Livre | Consulta os três pares na AwesomeAPI | 200, ativos com `bid`, `ask`, `data` e `variacao` |
| `POST /transacoes/previa` | Sim | `tipo`, `ativo`, `montante` | 200, simulação calculada sem gravar |
| `POST /transacoes` | Sim | Mesmos campos da prévia | 201, registro com identificador |
| `GET /transacoes` | Sim | Histórico da conta | 200, lista |
| `GET /transacoes/resumo` | Sim | Indicadores da conta | 200, `total`, `ativas`, `movimentado_centavos` |
| `PATCH /transacoes/:id/cancelar` | Sim | Cancela e preserva no histórico | 200, registro atualizado |
| `DELETE /transacoes/:id` | Sim | Remove do histórico | 204, corpo vazio |

Exemplos para um terminal com `curl`. Substitua o e-mail e a senha pelos de uma conta cadastrada localmente. Para as últimas duas chamadas, defina `TOKEN` no terminal com o token devolvido pelo login.

```sh
curl http://localhost:3000/api/cotacoes
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"estudante@example.org","senha":"SENHA_DA_CONTA"}'
curl -X POST http://localhost:3000/api/transacoes/previa \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"tipo":"VENDA","ativo":"BTC","montante":"0.00123456"}'
curl http://localhost:3000/api/transacoes/resumo -H "Authorization: Bearer $TOKEN"
```

Falhas têm mensagem no campo `erro`. Exemplos incluem dados inválidos (400), login ou sessão inválida (401), origem recusada (403), recurso ausente ou de outra conta (404), e-mail duplicado (409), excesso de tentativas de login (429), falha interna (500), fonte externa inválida ou indisponível (502) e tempo de espera esgotado (504).

## Testar e conferir a entrega

Na pasta `backend`, após `npm ci`, execute a suíte com o comando abaixo.

```sh
npm test
```

Os testes automatizados podem usar respostas externas controladas e bancos descartáveis. Para verificar a fonte real, inicie a API e use a chamada `GET /api/cotacoes` acima. A rede precisa permitir HTTPS para `economia.awesomeapi.com.br`. Se a fonte falhar, a interface informa o problema, o servidor recusa novas operações e o histórico salvo continua acessível.

Consulte os resultados da execução, os limites da validação e as evidências dos seis critérios em [Auditoria da entrega](docs/AUDITORIA.md). Para estudar o fluxo de uma requisição, a autorização e a matemática do spread, leia o [Guia de entendimento técnico](docs/ENTENDIMENTO_TECNICO.md).

As sessões duram uma hora e o token fica em `sessionStorage`. Um script malicioso executado na origem poderia lê-lo. O logout limpa a cópia do navegador. Uma cópia que tenha sido obtida antes do logout pode valer até a expiração. O histórico depende de conservar o arquivo SQLite com permissão de leitura e escrita. O projeto simula conversões e não executa ordens de câmbio, liquidação bancária ou custódia de ativos.

## Referências

- Edital do Projeto 02, Desenvolvimento Web, CEUB, 2º/2026, especialmente §§ 3 a 6. Projeto 01 entregue em `CambioTrack.zip`.
- Pares de moedas, campos e horário retornado. [API de Moedas da AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas)
- Rotas e middleware HTTP. [Guia do Express](https://expressjs.com/en/guide/routing.html)
- Persistência e consultas preparadas. [SQLite no Node.js](https://nodejs.org/api/sqlite.html) · [Chaves estrangeiras no SQLite](https://www.sqlite.org/foreignkeys.html)
- Hash e limite de 72 bytes. [Documentação do bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- Assinatura, algoritmo e expiração. [Documentação do jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- Compartilhamento de recursos entre origens e chamadas assíncronas. [Middleware CORS do Express](https://github.com/expressjs/cors) · [Fetch API na MDN](https://developer.mozilla.org/pt-BR/docs/Web/API/Fetch_API)
