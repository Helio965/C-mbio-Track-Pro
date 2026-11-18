# Auditoria final do Projeto 02

**18/11/2026 · CEUB · Desenvolvimento Web · Opção B, Câmbio Track Pro.** A revisão partiu da `main` em `43080ac`. O edital consultado tem quatro páginas. A seção 5 exige cliente responsivo, Express, persistência e autenticação. Os pesos abaixo vêm da seção 6. O prazo do portal é 30/11/2026 às 23h59.

## Evidência anterior e reprodução atual

O relatório do commit inicial registrava 19 testes aprovados e uma rodada em Chromium. Nesta revisão, executamos novamente a suíte daquele código e reproduzimos **19/19** antes dos ajustes. A suíte final passou em **21/21**, sem falhas ou testes ignorados. São 10 testes HTTP/SQLite e 11 de finanças e integração com o provedor. O roteiro de navegador abaixo foi executado separadamente. Os testes usaram contas geradas para a revisão e arquivos SQLite temporários.

## Achados e correções

| Prioridade | Constatação reproduzida | Correção e verificação |
|---|---|---|
| Importante | A conversão de preços para `Number` podia igualar `410000.000000000009` e `410000.000000000008`. Assim, um par com `ask` menor que `bid` podia passar na validação. | O serviço compara inteiros em escala decimal comum. O teste recusa o par invertido e aceita o válido. As fórmulas de compra e venda foram mantidas. |
| Importante | JSON com charset incompatível recebia 500, embora o servidor estivesse funcionando. | O middleware responde 415 com uma mensagem JSON. O caso de JSON malformado continua retornando 400. |
| Importante | Após o cadastro, o foco voltava ao corpo da página. O contorno dos campos e o foco sobre o cabeçalho tinham contraste baixo. | O e-mail recebe foco após reativar o formulário. O contraste das bordas passou de 1,77:1 para 4,04:1 e o do foco no cabeçalho de 1,73:1 para 9,62:1. Reavaliados no Chromium. |
| Importante para execução | O guia usava exemplos de terminal Bash. Os limites de versão declarados impediam instalação estrita em versões LTS que suportam os recursos utilizados. | O README traz dois terminais PowerShell, criação de chave antes do primeiro login e exemplos com `Invoke-RestMethod`. Os manifests e lockfiles dos dois componentes refletem os pisos efetivamente testados. |

A revisão não encontrou perda de operações, acesso entre contas ou outro defeito crítico nos fluxos exercitados. A consulta de mercado nesta nuvem e a execução nativa em Windows têm as limitações descritas abaixo.

## Matriz do barema

| Critério e peso | Arquivos e funcionalidade | Verificação desta revisão | Resultado ou pendência |
|---|---|---|---|
| Back-end e API · 2,5 | `backend/server.js`, `routes/auth.js`, `routes/transacoes.js` e `services/` sob `backend/`. Cadastro, login, perfil, cotações, prévia, CRUD e resumo. | Suíte fez requisições para Express em uma porta local. Cobriu entradas válidas e ausentes, JSON inválido, charset incorreto e IDs inexistentes. | Criação 201, leituras e cancelamento 200, exclusão 204. Erros retornaram JSON. |
| Banco de dados · 2,0 | `backend/database.js` cria tabelas estritas, chave estrangeira, e-mail único, índice e restrições financeiras. Rotas usam parâmetros e filtram pelo usuário do JWT. | SQLite em disco, duas simulações, encerramento do processo, nova conexão e novo login. O banco rejeitou excluir um proprietário com transação. Uma conexão de teste em modo somente leitura recusou nova escrita. | Registros e cotação histórica recuperados. A falha de escrita retornou 500 sem expor SQL e a leitura seguinte preservou o histórico. |
| Front-end · 2,0 | `frontend/index.html`, `login.html`, `css/style.css`, `js/login.js` e `js/script.js` sob `frontend/`. | Chromium em login, cadastro e painel a 320, 390, 768, 1280 e 1920 px. Checados navegação por teclado, foco, legibilidade, sobreposição e rolagem horizontal. | Fluxos aprovados nas cinco larguras. O axe-core 4.14.1 não apontou violações nos critérios WCAG A/AA 2.0/2.1 avaliados em 320 e 1280 px. |
| JWT e Bcrypt · 1,5 | `backend/middleware/auth.js` e `backend/routes/auth.js`. JWT HS256 com emissor e expiração de uma hora. Hash Bcrypt no cadastro. | Login correto/incorreto, e-mail duplicado, hash no banco, token ausente, inválido e expirado, duas contas e limite de tentativas. | Dados privados exigiram token. Uma conta diferente obteve carteira vazia e 404 ao tentar alterar a operação alheia. Logout limpou a sessão da aba. |
| Fetch e CORS · 1,0 | `frontend/js/api.js`, `backend/server.js`, `backend/services/cotacoes.js`. | Cliente em 5173 chamou Express em 3000. Foram exercitados preflight, origem recusada, carregamento, erro de rede do navegador, sucesso controlado e indisponibilidade do provedor. | Preflight 204 na origem configurada. O histórico continuou acessível ao falhar a fonte externa. A cotação real ficou bloqueada no proxy. |
| Documentação e ZIP · 1,0 | README, `docs/ENTENDIMENTO_TECNICO.md`, três `.gitignore`, lockfiles e pacote de entrega. | Conferência de nomes e conteúdo do ZIP, instalação limpa e execução dos dois servidores. | O pacote contém uma raiz `CambioTrack-Pro/` e 27 arquivos. A execução local foi conferida em Linux com PowerShell. Falta preencher a matrícula no nome do arquivo. |

## Operações conferidas no navegador

A automação dirigiu **Chromium 156.0.8078.79** contra os dois servidores do projeto. Somente o HTTP de saída para a AwesomeAPI recebeu preços controlados. A autenticação, as requisições do navegador, a escrita e a leitura de SQLite ocorreram nos componentes da aplicação.

1. Uma confirmação de senha divergente impediu o cadastro. O login rejeitou a senha errada e abriu a carteira vazia com a correta.
2. Venda de USD 10 a R$ 5,00 por dólar (bid) resultou em R$ 50,00 brutos, R$ 0,50 de taxa e R$ 49,50 líquidos. Compra com R$ 62,00 a R$ 6,20 por euro (ask) resultou em R$ 0,62 de taxa e EUR 9,90 recebidos. Após a recarga, as duas operações somavam R$ 112,00 de volume bruto.
3. Uma nova cotação não alterou o preço da venda salva. Após fechar o navegador e reiniciar a API com o mesmo arquivo, uma nova sessão recuperou os dois registros. Com o provedor indisponível, o painel manteve o histórico e impediu novo registro. Colocar o navegador offline e voltar à rede exercitou a recuperação do cliente.
4. Cancelar a venda deixou duas operações, uma ativa e R$ 62,00 de volume. Excluir **a compra** deixou uma venda cancelada, zero ativas e R$ 0,00 movimentados. A segunda conta permaneceu sem operações.

Nos testes de cálculo, entradas de USD, EUR e BTC cobriram spread de 1%, centavos, precisão de oito casas, arredondamento e limites. Campos de cotação e taxa enviados pelo cliente foram ignorados pelo cálculo do servidor.

## Rede externa

Em produção, o serviço consulta `https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL` e espera os objetos USDBRL, EURBRL e BTCBRL com `code`, `codein`, `bid`, `ask` e `timestamp`. A variação `pctChange` é opcional. Respostas de teste exercitaram esse formato, falta de um par, preço inválido, HTTP 429 e 500, corpo vazio, JSON inválido, erro de conexão e timeout.

**Tentativa com a fonte real.** O proxy da nuvem devolveu CONNECT 403 antes de alcançar a AwesomeAPI. No processo real local, a consulta e a tentativa de gravar uma venda retornaram 502. O histórico autenticado continuou respondendo 200. A resposta de mercado atual e o formato efetivamente enviado pelo provedor nesta data ficaram sem confirmação. Para conferi-los em outra rede, use a consulta de preços no README.

## Instalação, versões e ZIP

- **Node.** Em Linux x64, Node 22.21.0 e 24.5.0 passaram por `npm ci --engine-strict` em ambos os componentes e pelos 21 testes com o padrão de arquivos enviado literalmente ao runner. Em cada versão, `npm start` iniciou os dois servidores. As páginas de login responderam 200, a rota privada sem token respondeu 401 e o preflight entre as portas locais retornou 204. Em 22.20.0 e 24.4.1 o Node rejeitou a opção `--use-env-proxy`. O README recomenda um patch atualizado da linha 24 LTS.
- **PowerShell.** No Debian 13, PowerShell 7.6.3, Node 24.22.1 e npm 11.9.0 foram usados no fluxo de extração, configuração do arquivo privado, instalação, suíte, login e chamadas HTTP do README. Em Linux, o executável é `npm`; no Windows o README usa `npm.cmd`. O pacote Bcrypt inclui binários para Windows x64 e ARM64. O ensaio não abrangeu Windows nativo, Windows PowerShell 5.1 ou o VS Code em Windows.
- **Dependências.** `npm audit --omit=dev` encontrou zero vulnerabilidades conhecidas nas dependências de produção do back-end nesta revisão. O sandbox usa um cache npm gravável em `/tmp`. Em uma instalação comum, o npm usa o cache do próprio usuário.
- **Entrega.** O empacotamento inclui os arquivos de código do Git e `backend/.env.example`. A inspeção verificou a ausência de dependências, repositório Git interno, banco, logs, chaves e configuração privada. Substitua `Matricula` no nome do ZIP pela matrícula do estudante antes de enviar ao portal.
