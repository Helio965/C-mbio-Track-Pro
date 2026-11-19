# Câmbio Track Pro

**Projeto 02 de Desenvolvimento Web · CEUB · 2º semestre de 2026 · Professor Maurizio Prizzi**

**Tema: Opção B — Câmbio Track Pro, Carteira de Investimentos** · Autor: Hélio de Almeida Vargas Neto

Simule uma venda de dólar, euro ou bitcoin para receber reais, ou uma compra desses ativos usando reais. As cotações vêm da AwesomeAPI e a carteira de cada conta fica salva no servidor próprio, em SQLite. A carteira mantém o preço usado em cada registro. Você pode fechar o navegador, reiniciar a API e entrar novamente para consultar suas operações.

O painel evolui o CâmbioTrack do Projeto 01. Mantém os três pares com BRL, a atualização manual de cotações, a prévia, o spread de 1%, os indicadores e os cartões de histórico. O Projeto 02 acrescenta contas individuais com JWT e Bcrypt, operações de compra, exclusão de registros e persistência em SQLite.

| Parte | Tecnologia | Pasta |
| --- | --- | --- |
| Back-end (API RESTful) | Node.js + Express 5, JWT, Bcrypt | `backend/` |
| Banco de dados | SQLite (módulo `node:sqlite`, já incluso no Node.js) | `backend/data/cambio.sqlite`, criado ao iniciar |
| Front-end | HTML5, CSS3 e JavaScript puro (Vanilla JS) com Fetch | `frontend/` |

## Requisitos

- **Node.js 24 LTS ou 26 LTS** com o npm que o acompanha ([nodejs.org](https://nodejs.org/)). A linha 22 também funciona a partir da **22.21.0**; na linha 24, o mínimo é **24.5.0**. Versões anteriores não iniciam a API e mostram `node: bad option: --use-env-proxy`.
- Acesso à internet para as cotações. O cadastro, o login e o histórico funcionam mesmo sem a AwesomeAPI.
- Não é preciso instalar banco de dados, compilador ou extensões: o SQLite vem com o Node.js e o Bcrypt traz binários prontos para Windows x64 e ARM64.

## Executar no Windows com VS Code e PowerShell

1. Extraia o ZIP e, no VS Code, use **Arquivo › Abrir Pasta** na pasta **CambioTrack-Pro**, a que contém este README e as pastas `backend` e `frontend`. Se você baixou o projeto do GitHub, a pasta se chama `C-mbio-Track-Pro-main`; os comandos são os mesmos.
2. Abra um terminal em **Terminal › Novo Terminal**. Ele começa na pasta do projeto e usa o PowerShell. Abra um segundo terminal com o botão **+** do painel. Os dois servidores rodam ao mesmo tempo, um em cada terminal.

**Terminal 1: API (back-end, porta 3000)**

```powershell
node --version
cd backend
npm.cmd ci
if (-not (Test-Path -LiteralPath .env)) {
    node -e "const fs=require('node:fs'); const key=require('node:crypto').randomBytes(48).toString('hex'); fs.writeFileSync('.env','JWT_SECRET='+key+'\n',{flag:'wx',mode:0o600})"
}
npm.cmd start
```

O bloco `if` cria, só na primeira vez, o arquivo privado `backend/.env` com uma chave JWT aleatória. Ele não sobrescreve um `.env` existente e nenhuma chave real acompanha o ZIP. Espere a mensagem **`Câmbio Track Pro na porta 3000`** e deixe o terminal aberto.

**Terminal 2: interface (front-end, porta 5173)**

```powershell
cd frontend
npm.cmd ci
npm.cmd start
```

Espere a mensagem **`Front-end disponível na porta 5173: abra http://localhost:5173`** e abra **http://localhost:5173** no navegador. A interface chama a API em `http://localhost:3000/api`.

**Detalhes dos comandos**

- `npm.cmd` é o npm do Windows. No PowerShell, o comando `npm` pode ser bloqueado pela política de scripts (`running scripts is disabled on this system`). No Prompt de Comando (cmd) e no Linux ou macOS, use `npm` nas mesmas linhas.
- `npm.cmd ci` instala exatamente as versões registradas no `package-lock.json`. `npm.cmd install` também funciona. O front-end não tem dependências, então o comando só confere o projeto.
- `npm.cmd run dev` inicia o mesmo servidor e o reinicia sozinho quando um arquivo é salvo. Vale para os dois terminais.
- Para encerrar um servidor, pressione **Ctrl+C**. Se aparecer `Deseja finalizar o arquivo em lotes (S/N)?`, responda `S`.
- Também é possível usar um só endereço: com a API ligada, **http://localhost:3000** entrega a mesma interface pelo Express.

**Mensagens esperadas, que não são erros**

- `npm warn install-scripts ... bcrypt@6.0.0` (versões recentes do npm, como 11.19 e 11.20): o npm avisa que o bcrypt tem script de instalação. O pacote já traz o binário pronto e funciona com ou sem esse script.
- `ExperimentalWarning: SQLite is an experimental feature` (Node 22 e versões iniciais do 24): o SQLite embutido funciona normalmente. O Node 24 atualizado e o 26 não mostram o aviso.
- O Firewall do Windows pode perguntar se o Node.js pode usar a rede. O uso local funciona com qualquer resposta. Se permitir, escolha apenas redes privadas.

**Solução de problemas**

| Mensagem | Causa | Solução |
| --- | --- | --- |
| `node: bad option: --use-env-proxy` | Node.js anterior a 22.21.0 ou 24.5.0 | Instale o Node.js 24 LTS ou 26 LTS e abra um novo terminal. |
| `Falha ao iniciar o servidor. Configure JWT_SECRET com pelo menos 32 bytes.` | O arquivo `backend/.env` não existe ou está vazio | Execute de novo o bloco `if` do Terminal 1 dentro da pasta `backend`. |
| `Falha ao abrir a porta do servidor. EADDRINUSE` | Outro programa usa a porta 3000 | Encerre a outra API. A interface da porta 5173 espera a API na porta 3000. |
| `A AwesomeAPI recusou a consulta por limite de uso (HTTP 429)` | A fonte limita consultas sem chave por endereço de internet | Aguarde alguns minutos ou use uma chave gratuita da AwesomeAPI em `AWESOMEAPI_KEY` (veja abaixo). |
| `Não foi possível conectar ao servidor` no painel | A API não está rodando | Inicie o Terminal 1 e recarregue a página. |

**Variáveis do back-end (`backend/.env`)**

| Variável | Uso |
| --- | --- |
| `JWT_SECRET` | Chave privada do servidor para assinar e validar sessões, com pelo menos 32 bytes. Mantenha a mesma chave nos reinícios para validar sessões ainda vigentes. |
| `PORT` | Porta HTTP da API. O padrão é `3000`. |
| `DB_PATH` | Caminho do arquivo SQLite. O padrão é `backend/data/cambio.sqlite`. O processo precisa poder escrever nesse diretório. |
| `FRONTEND_ORIGINS` | Origens de navegador autorizadas pelo CORS, separadas por vírgula. O padrão é `http://localhost:5173,http://127.0.0.1:5173`. |
| `AWESOMEAPI_KEY` | Opcional. Chave gratuita criada em [awesomeapi.com.br](https://awesomeapi.com.br), enviada no cabeçalho `x-api-key`. Para usar, abra `backend/.env` no VS Code, acrescente `AWESOMEAPI_KEY=sua-chave` e reinicie a API. |

`backend/.env.example` é o modelo dessas variáveis, sem segredos. O `.env` real fica fora do Git e do ZIP.

## Usar a carteira

1. Em **Criar conta**, informe nome, e-mail, senha e confirmação. Use uma senha de pelo menos oito caracteres e até 72 bytes. Depois entre com o e-mail e a senha da conta.
2. Consulte os preços de USD, EUR e BTC e o horário informado pela fonte. O botão **Atualizar cotações** consulta a fonte novamente.
3. Selecione compra ou venda, escolha o ativo e informe o montante. Na compra, informe **reais disponíveis**. Na venda, informe **unidades do ativo**. Confira o preço, o bruto, a taxa e o resultado na prévia.
4. Registre a simulação. O servidor obtém a cotação no momento do registro e devolve os valores definitivos.
5. Consulte o histórico. **Cancelar** preserva o cartão e retira a operação dos totais ativos. **Excluir** remove o registro do banco. **Sair** encerra a sessão na aba. Ao entrar de novo, a API carrega a carteira da conta.
6. Para verificar a persistência, registre uma operação, anote seu valor e horário e feche o navegador. Encerre a API com Ctrl+C e inicie-a de novo com `npm.cmd start`. Abra o front-end, entre na mesma conta e localize a operação.

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
│   ├── services/                 # Cotações da AwesomeAPI, validação e cálculos
│   └── tests/                    # Testes HTTP, banco, cálculos e falhas
├── frontend/
│   ├── .gitignore
│   ├── package.json, package-lock.json
│   ├── server.js                 # Servidor estático da interface (porta 5173)
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

USD e EUR admitem duas casas decimais e BTC admite oito. A entrada em BRL admite duas. O montante pode chegar a um bilhão de unidades, o bruto deve ficar entre R$ 0,01 e R$ 1 bilhão e a quantidade resultante deve ser positiva e respeitar o limite. A compra descarta a fração menor que a unidade mínima representável. O **volume movimentado** soma o bruto em BRL das compras e das vendas ativas. Trata-se de volume de simulações, sem representar saldo disponível ou rentabilidade. As contas usam inteiros (`BigInt`) em vez de ponto flutuante.

## Cotações da AwesomeAPI

A API consulta `https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL` e confere código, `bid`, `ask` e `timestamp` de cada par. A interface exibe essas cotações pela rota `GET /api/cotacoes` do servidor próprio, e o mesmo preço é usado para calcular e gravar cada operação. Assim o navegador não consegue enviar um preço diferente.

- A consulta tem limite de 12 segundos. Falha, demora ou resposta inválida da fonte bloqueia novas simulações, sem apagar nem impedir a leitura do histórico.
- A última cotação válida é reaproveitada por até 30 segundos. Sem chave, a própria AwesomeAPI repete a mesma resposta por 1 minuto e limita o número de consultas por endereço (HTTP 429). Por isso, digitar valores na prévia não gasta a cota a cada tecla. Cada operação grava o horário informado pela fonte.
- Segundo a documentação da AwesomeAPI, com `AWESOMEAPI_KEY` a fonte oferece cota própria (100 mil requisições mensais gratuitas) e dados sem o cache de 1 minuto.

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

**Consultar a API pelo PowerShell.** Em um terceiro terminal, use o e-mail e a senha de uma conta criada pela interface. O login guarda o token na memória do terminal. A consulta de perfil e o resumo funcionam inclusive quando a fonte de preços estiver indisponível.

```powershell
$api = 'http://localhost:3000/api'
$conta = Get-Credential -Message 'Informe o e-mail e a senha da conta local'
$login = @{ email = $conta.UserName; senha = $conta.GetNetworkCredential().Password } | ConvertTo-Json
$sessao = Invoke-RestMethod -Method Post -Uri "$api/auth/login" -ContentType 'application/json; charset=utf-8' -Body $login
$headers = @{ Authorization = "Bearer $($sessao.token)" }
Invoke-RestMethod -Uri "$api/auth/me" -Headers $headers
Invoke-RestMethod -Uri "$api/transacoes/resumo" -Headers $headers
```

**Consultar preços e simular uma venda.** No mesmo terminal, a última chamada pede uma prévia e conserva o histórico.

```powershell
Invoke-RestMethod -Uri "$api/cotacoes"
$venda = @{ tipo = 'VENDA'; ativo = 'BTC'; montante = '0.00123456' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$api/transacoes/previa" -Headers $headers -ContentType 'application/json' -Body $venda
```

Falhas têm mensagem no campo `erro`. Exemplos incluem dados inválidos (400), login ou sessão inválida (401), origem recusada (403), recurso ausente ou de outra conta (404), e-mail duplicado (409), corpo muito grande (413), codificação não suportada (415), excesso de tentativas de login (429), falha interna (500), fonte externa inválida, indisponível ou com limite de uso esgotado (502) e tempo de espera esgotado (504).

## Testar e conferir a entrega

No PowerShell, abra a pasta `backend` e execute a suíte após a instalação das dependências.

```powershell
npm.cmd test
```

São 25 testes automatizados com bancos SQLite temporários e respostas externas controladas, sem tocar no banco real em `backend/data`. Para verificar a fonte real, inicie a API e use a chamada `GET /api/cotacoes` acima. A rede precisa permitir HTTPS para `economia.awesomeapi.com.br`. Se a fonte falhar, a interface informa o problema, o servidor recusa novas operações e o histórico salvo continua acessível.

Consulte os resultados da execução, os limites da validação e as evidências dos seis critérios em [Auditoria da entrega](docs/AUDITORIA.md). Para estudar o fluxo de uma requisição, a autorização e a matemática do spread, leia o [Guia de entendimento técnico](docs/ENTENDIMENTO_TECNICO.md).

As sessões duram uma hora e o token fica em `sessionStorage`. Um script malicioso executado na origem poderia lê-lo. O logout limpa a cópia do navegador. Uma cópia que tenha sido obtida antes do logout pode valer até a expiração. O histórico depende de conservar o arquivo SQLite com permissão de leitura e escrita. O projeto simula conversões e não executa ordens de câmbio, liquidação bancária ou custódia de ativos.

## Referências

- Edital do Projeto 02, Desenvolvimento Web, CEUB, 2º/2026, especialmente §§ 3 a 6. Projeto 01 entregue em `CambioTrack.zip`.
- Pares de moedas, campos, cache e chave de acesso. [API de Cotações da AwesomeAPI](https://docs.awesomeapi.com.br/api-de-moedas) · [Instruções de API Key](https://docs.awesomeapi.com.br/instrucoes-api-key)
- Rotas e middleware HTTP. [Guia do Express](https://expressjs.com/en/guide/routing.html)
- Persistência e consultas preparadas. [SQLite no Node.js](https://nodejs.org/api/sqlite.html) · [Chaves estrangeiras no SQLite](https://www.sqlite.org/foreignkeys.html)
- Hash e limite de 72 bytes. [Documentação do bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- Assinatura, algoritmo e expiração. [Documentação do jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- Compartilhamento de recursos entre origens e chamadas assíncronas. [Middleware CORS do Express](https://github.com/expressjs/cors) · [Fetch API na MDN](https://developer.mozilla.org/pt-BR/docs/Web/API/Fetch_API)
