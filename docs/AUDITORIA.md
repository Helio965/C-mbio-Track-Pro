# Auditoria do Projeto 02

Verificação de 18/11/2026 para a Opção B do edital de Desenvolvimento Web do CEUB. As pontuações abaixo são os pesos do professor.

| Critério do edital | Peso | Onde conferir | Teste e resultado |
|---|---:|---|---|
| Back-end e API em Node/Express, respostas JSON e tratamento de erros | 2,5 | `backend/server.js` e `backend/routes/transacoes.js`, funções `createApp` e `rotasTransacoes` | Requisições HTTP cobriram criação (201), leitura, prévia sem gravação, cancelamento e exclusão (204). Identificador inválido, rota inexistente e JSON inválido produziram erros. |
| Modelagem, leitura e escrita no banco | 2,0 | `backend/database.js`, função `abrirBanco`, tabelas `usuarios` e `transacoes` | O teste consultou a linha no arquivo SQLite, fechou servidor e banco e autenticou novamente depois da reabertura. O registro recuperado coincidiu com o original. A definição e a ativação da FK foram conferidas e o total bruto excluiu operações canceladas. |
| Front-end integrado e responsivo | 2,0 | `frontend/login.html`, `index.html`, `css/style.css`, `js/login.js` e `js/script.js` | O roteiro em Chromium abaixo verifica formulários, valores e histórico em diferentes tamanhos de tela. |
| Autenticação JWT e Bcrypt | 1,5 | `backend/middleware/auth.js` e `backend/routes/auth.js`, rotas de cadastro, login e perfil | Conferidos hash Bcrypt e e-mail único no banco, login incorreto, expiração, assinatura, ausência de token e limite de tentativas. A segunda conta recebeu uma carteira vazia e 404 ao tentar alterar um registro da primeira. |
| Integração Fetch e estados da interface | 1,0 | `frontend/js/api.js`, `atualizarCarteira` e `buscarCotacoes` em `frontend/js/script.js`, `backend/services/cotacoes.js` | Preflight CORS para o cliente local, origem recusada, resposta válida controlada e respostas externas com erro. A consulta de mercado ao vivo ficou pendente nesta nuvem, conforme o teste abaixo. |
| Documentação, comentários e ZIP | 1,0 | README, guia técnico, três arquivos `.gitignore` e pacote de entrega | Roteiro para iniciar dois servidores e cadastrar a primeira conta. O pacote usa uma pasta raiz e inclui os dois lockfiles e o modelo público de configuração. |

## API, cálculos e falhas

Em `backend/`, `npm ci` instala o lockfile. `npm test` executa a suíte de HTTP/SQLite em `tests/api.test.js` e a suíte de cálculo e provedor em `tests/finance.test.js`. Foram aprovados 19 testes, com zero falhas e zero testes ignorados. A verificação `npm audit` encontrou zero vulnerabilidades conhecidas nas dependências instaladas nessa data.

- Uma venda de USD 10,25 a R$ 5,00 somou 5.125 centavos ao bruto e recebeu 5.074 centavos após 51 de spread. Uma compra com R$ 100,00 a R$ 5,50 entregou USD 18,00. Asserções independentes conferiram os resultados de cada operação, a soma bruta de R$ 151,25 e os efeitos de cancelar e excluir.
- As cotações controladas dos testes também cobriram EUR, BTC com oito casas, frações que arredondam a meio centavo, saídas pequenas demais e o limite de um bilhão. A mudança posterior de preço preservou o preço histórico.
- Os testes do provedor reproduziram tempo limite, falha de rede, HTTP de erro, JSON inválido e resposta incompleta. Durante uma falha externa, o histórico da operação anterior continuou legível. Uma resposta 502 representa preço indisponível e 504 representa tempo limite.
- Na execução com o provedor de produção, o proxy bloqueou o acesso a `economia.awesomeapi.com.br` (CONNECT 403). Uma conta local obteve 502 em `GET /api/cotacoes` e em `POST /api/transacoes`. A listagem autenticada seguinte retornou 200 e zero registros. Para repetir o teste com preço de mercado, a rede do servidor precisa permitir esse destino por HTTPS.

## Persistência e reprodução pelo avaliador

1. Inicie os dois processos indicados no README. Cadastre uma conta e entre. Com as cotações disponíveis, registre uma compra e uma venda. Anote os IDs, a cotação usada e o total movimentado.
2. Atualize a página, feche o navegador e encerre o processo do back-end. Inicie novamente com o mesmo arquivo SQLite. Em uma janela nova, faça login com a mesma conta. Confira os IDs e valores que anotou.
3. Cancele uma das simulações. Ela deve permanecer no histórico com o status de cancelada. O indicador de movimentado deve diminuir pelo bruto dessa operação. Exclua o registro e confirme a redução na contagem total.
4. Em uma segunda conta, confira que o histórico inicial está vazio. A API calcula o proprietário a partir do token verificado pelo servidor.

## Resultado no navegador

Chromium 156.0.8078.79, dois processos iniciados com `npm start` e SQLite temporário em disco. A automação local usou Playwright para dirigir o navegador. Somente a chamada de saída do servidor para a AwesomeAPI recebeu respostas controladas. O navegador percorreu as rotas HTTP reais do projeto.

| Ação | Resultado observado |
|---|---|
| Cadastro com confirmação divergente, cadastro válido e login incorreto | A confirmação impediu o envio. O cadastro válido permitiu entrar depois. A senha incorreta recebeu 401. |
| Vender USD 10 com `bid` 5,00 e comprar EUR com R$ 62 usando `ask` 6,20 | A venda retornou R$ 49,50 líquidos. A compra cobrou R$ 0,62 e entregou EUR 9,90. Após recarregar, o painel mostrou duas ativas e R$ 112,00 movimentados. |
| Atualizar `bid` do USD para 7,00 e interromper o provedor | O SQLite conservou o preço original de 5,00. O HTTP 503 controlado da fonte produziu 502 na API. O painel bloqueou novos registros e manteve o histórico. |
| Fechar o navegador, parar o processo da API e consultar o arquivo SQLite | Duas linhas em disco. Um novo processo e um navegador limpo exigiram login e recuperaram as duas operações mesmo com a fonte fora do ar. |
| Restabelecer o provedor, cancelar a venda e depois excluí-la | Após cancelar, duas registradas e uma ativa. Após excluir, uma registrada e uma ativa. O bruto em ambos os casos foi R$ 62,00. |
| Logout e expiração | Logout retornou ao login. Em teste com o relógio do processo adiantado duas horas, o JWT antes válido recebeu 401. A interface limpou a sessão e exibiu o aviso de expiração. |
| Larguras de 320, 390, 768, 1280 e 1920 px | Login, cadastro e painel com duas operações couberam nas cinco larguras sem rolagem horizontal. A navegação por Tab e a associação dos rótulos aos campos foram verificadas. |

## Instalação e empacotamento

O primeiro `npm ci` desta nuvem tentou gravar no cache padrão do usuário, que o sandbox restringe. A instalação com `npm_config_cache` apontando para um diretório gravável em `/tmp` concluiu com os mesmos lockfiles e verificações de integridade. O cache é uma configuração local do ambiente.

A entrega leva os arquivos-fonte do Git sob `CambioTrack-Pro/`. O nome do pacote usa o primeiro nome e o sobrenome do README do Projeto 01. Substitua o campo `Matricula` no nome do ZIP pela matrícula antes do upload individual no portal do CEUB.
