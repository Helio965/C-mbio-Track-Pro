# Auditoria final do Projeto 02

**19/11/2026 · CEUB · Desenvolvimento Web · Opção B, Câmbio Track Pro.** A revisão partiu da `main` em `cdf9682`, idêntica arquivo a arquivo ao ZIP Full Stack anterior. O edital consultado tem quatro páginas: os requisitos vêm das seções 2 a 5 e os pesos, da seção 6. O prazo do portal é 30/11/2026 às 23h59. Este documento substitui a auditoria anterior e registra apenas o que foi executado nesta revisão.

## Ambiente e método

- **Sistema:** Linux x64. **Navegador:** Chromium 157.0.8103.78, automatizado pelo Playwright 1.63.0.
- **Node.js:** 22.13.0, 22.20.0, 22.21.0, 22.23.5, 24.0.0, 24.5.0, 24.22.3 e 26.13.1, com o npm de cada um (10.9.2 a 11.20.0). O 22.12.0 serviu para confirmar o limite inferior.
- **Quatro níveis de verificação:**
  1. A suíte automatizada (`npm test`), que o avaliador pode repetir.
  2. Um ensaio HTTP contra o processo real iniciado com `npm start`, com arquivo SQLite temporário.
  3. Um ensaio no navegador com os dois servidores reais, portas 5173 e 3000.
  4. Uma revisão adversarial independente, em seis frentes: código alterado, comentários do back-end, comentários do front-end, documentação e PowerShell, edital e segurança. Um verificador separado tentou refutar cada achado.
- Nos ensaios 2 e 3, somente a saída HTTPS para a AwesomeAPI recebeu respostas controladas. Express, SQLite, Bcrypt, JWT, CORS e Fetch foram os componentes reais. Respostas simuladas nunca foram tratadas como cotação real.
- Os roteiros dos ensaios 2 e 3 são ferramentas da revisão e não fazem parte da entrega. O avaliador reproduz a suíte com `npm test` e o uso completo com os passos do README.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Suíte automatizada do back-end | **26/26** em cada uma das oito versões do Node: os 21 testes anteriores e 5 novos. Os novos reprovam o código anterior e passam no atual. |
| Ensaio HTTP no processo real | **129/129** verificações |
| Ensaio no navegador | **54/54** verificações |
| Valores longos a 320, 360 e 390 px | Nenhum valor quebrado em duas linhas, com BTC a R$ 550 mil e a R$ 1,05 milhão. No ensaio de navegador, só o total extremo de R$ 1 bilhão (`R$ 1.061.061.743,32`) ocupa duas linhas a 320 px, sem rolagem horizontal. |
| Instalação limpa a partir do ZIP | Aprovada nas oito versões, com cache npm vazio. O 22.12.0 é recusado pelo campo `engines`, como previsto. |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas |
| AwesomeAPI real | HTTP 429 `QuotaExceeded` nesta rede (ver **Rede externa**) |
| Revisão adversarial | 40 achados. Todos os 24 confirmados foram corrigidos. Dos 12 reais, mas sem impacto, 11 foram corrigidos mesmo assim. Os 4 restantes foram refutados. |

## Achados e correções

**Primeira rodada**

| Prioridade | Constatação reproduzida | Correção e verificação |
| --- | --- | --- |
| Edital, § 5.5 | O edital pede todo o código lógico comentado para leigos. `js/script.js` tinha 7 linhas de comentário em 279, `routes/transacoes.js` 2 em 68, os testes quase nenhum, e os HTML nenhum. | Todos os arquivos JavaScript do back-end e do front-end, inclusive os testes, receberam comentários didáticos. Os HTML ganharam comentários de seção. Comparei o código sem comentários com o da base `cdf9682`, usando o compilador TypeScript. Cinco arquivos JavaScript ficaram idênticos: `database.js`, `routes/auth.js`, `routes/transacoes.js`, `services/cambioService.js` e `js/api.js`. O `index.html` só ganhou comentários, e o `login.html` também recebeu `method="post"`. No `frontend/server.js`, mudou apenas a mensagem de inicialização. As demais diferenças são as correções das duas tabelas. |
| Alta | A AwesomeAPI real respondeu 429 `QuotaExceeded`, e a interface mostrava "AwesomeAPI indisponível (HTTP 429)". Cada prévia consultava a fonte, embora, sem chave, a fonte repita a mesma resposta por 1 minuto. | A mensagem agora explica o limite de uso. A última cotação válida é reaproveitada por 30 s: pedidos simultâneos compartilham uma consulta e falhas não ficam guardadas. Também há a chave opcional `AWESOMEAPI_KEY`, enviada no cabeçalho `x-api-key`. No trecho do ensaio de navegador com digitação e dois registros, as consultas à fonte caíram de 4 para 0. As fórmulas financeiras não mudaram. |
| Média | Quem usa o teclado perdia o foco, que caía no corpo da página, depois de um login recusado com Enter, depois de registrar uma simulação e ao usar "Atualizar cotações" ou "Atualizar carteira". | O foco volta ao controle de origem (checagens N34 a N37). Se a fonte de preços cair durante a prévia ou o registro, o foco vai para "Tentar novamente" (N39 e N40). |
| Média | A 320 px, a cotação do BTC quebrava no meio do número nos cartões do histórico: "R$ 550.000,000" numa linha e "0" na seguinte. Com o BTC acima de R$ 1 milhão, o mesmo acontecia nos cartões de cotação. | Até 360 px, os detalhes ficam em uma coluna e os três números grandes usam fonte menor. Larguras maiores não mudam. |
| Documentação | O README não identificava o autor e não citava o Node 26 LTS, o nome da pasta baixada do GitHub, os avisos esperados no terminal nem o que fazer diante do 429. A auditoria anterior trazia execuções que não foram reproduzidas aqui, como PowerShell 7.6.3 e axe-core. | README revisado com guia para Windows, avisos esperados, tabela de problemas e chave opcional. Esta auditoria substitui a anterior. |

**Segunda rodada (revisão adversarial)**

| Constatação confirmada | Correção e verificação |
| --- | --- |
| Textos do README, um comentário da rota e o aviso da prévia prometiam nova consulta à fonte a cada clique ou registro, mas o reaproveitamento de 30 s devolve a mesma cotação nesse prazo. | Textos corrigidos. O aviso da prévia passou a "O valor final é calculado pelo servidor ao registrar." |
| A mensagem e os textos do 429 diziam que o limite é "por endereço" e mandavam "aguardar alguns minutos". A documentação da fonte não sustenta isso, e o 429 persistiu por mais de uma hora, em dois endereços de saída. | Os textos agora descrevem só o observado (cota esgotada). A orientação passou a "tente mais tarde ou configure `AWESOMEAPI_KEY`". |
| Devolver o foco rolava a página de volta ao botão para quem rolou a tela durante a espera, com mouse ou toque. | Foco devolvido sem rolagem (`preventScroll`). A rolagem só acontece no desvio para "Tentar novamente". A checagem N41 reprova o código anterior (rolagem de 700 para 0) e passa no atual. |
| Nenhum teste fixava a validade padrão de 30 s: um reaproveitamento que nunca expira passava em toda a suíte. A validade era medida por um relógio que não avança enquanto o computador está suspenso. | O teste usa a validade padrão de produção. A idade passa a ser medida pelo relógio do computador, com nova consulta se ele voltar no tempo. Com `VALIDADE_MS = Infinity`, a suíte agora reprova. |
| Um token emitido antes de apagar e recriar o banco abria a carteira de outra pessoa que recebesse o mesmo número de conta. | O token passa a levar a data de criação da conta, conferida a cada pedido. O teste novo reprova o código anterior e passa no atual. No processo real, a checagem U3 confirmou o 401 para o token antigo, e a U4, o acesso normal da conta nova. |
| Sem JavaScript, o formulário de login enviava e-mail e senha no endereço da página (GET). | `method="post"`: o envio nativo não expõe os dados, e com JavaScript nada muda. |
| A opção `--use-env-proxy` no `npm start` era o único motivo dos mínimos 22.21.0 e 24.5.0. Sem ela, 22.13.0, 22.20.0 e 24.0.0 passam em todos os testes e iniciam a API. | `npm start` e `npm run dev` ficaram sem a opção, e `npm run start:proxy` a mantém para redes com `HTTPS_PROXY`. O `engines` dos dois projetos passou a `^22.13.0 \|\| >=24.0.0`. |
| README: o bloco `if` era indicado também para cmd/bash, onde não funciona. Faltava o caso de `.env` existente sem `JWT_SECRET`. | Instruções separadas para PowerShell, cmd e Linux/macOS, nova solução para o `.env` sem chave e aviso para não abrir os HTML pelo disco ou pelo Live Server. |
| Comentários com imprecisões factuais. Exemplos: CSS dizia que os valores eram calculados no JavaScript; o servidor estático dizia usar só o módulo http; o comentário dos CHECK dizia que a taxa era positiva (ela pode ser zero); o comentário do JWT omitia o `iat`. | Todos corrigidos. Rótulos dos campos e regiões `aria-live`, `status` e `alert` foram conferidos na checagem N42. |

Não aplicado, por estar fora do que o edital pede: um limite de tentativas para o **cadastro**. O login tem esse limite.

A revisão não encontrou perda de operações, liberação indevida de CORS nem segredos versionados.

## Matriz do barema

| Critério e peso | Arquivos responsáveis | Testes desta revisão | Evidência | Pendência |
| --- | --- | --- | --- | --- |
| Back-end e API · 2,5 | `backend/server.js`, `routes/auth.js`, `routes/transacoes.js`, `services/` | Suíte e ensaio HTTP com as 10 rotas, entradas válidas e inválidas, JSON malformado, corpo acima de 16 kB, charset errado, IDs inválidos, métodos sem rota e banco bloqueado. | Respostas 201, 200 e 204 nos sucessos. Erros em JSON `{ "erro" }` com 400, 401, 403, 404, 409, 413, 415, 429, 500, 502 e 504. Com o banco bloqueado, 500 genérico sem SQL e recuperação em seguida. Um tratador central de erros cumpre o papel do try/catch para todas as rotas (Express 5). | Nenhuma |
| Banco de dados · 2,0 | `backend/database.js`, consultas preparadas em `routes/` | Gravação, leitura, cancelamento e exclusão conferidos também direto no arquivo SQLite. Ctrl+C, novo `npm start`, novo login. Chave estrangeira e e-mail único. | Histórico e resumo idênticos após o reinício. A cotação histórica foi preservada com um preço novo na fonte. A linha excluída deixou de existir no arquivo. O banco recusa operação órfã. | Nenhuma |
| Front-end · 2,0 | `frontend/index.html`, `login.html`, `css/style.css`, `js/` | Fluxos completos no Chromium. Larguras de 320, 390, 768, 1280 e 1920 px no login e no painel. Teclado, foco, rolagem, rótulos e regiões anunciadas. | Sem rolagem horizontal nem elementos fora da tela nas cinco larguras. Estados de carregamento, erro, vazio e sucesso. Login completo só com teclado. | Nenhuma |
| JWT e Bcrypt · 1,5 | `backend/middleware/auth.js`, `routes/auth.js` | Hash `$2b$10$` no banco. Senha de 72 bytes mais sufixo recusada. Token ausente, inválido, adulterado, expirado, `alg none`, de outro emissor, sem `exp`, sem a data da conta ou com data diferente, de outra chave, de conta removida e de banco recriado. Duas contas. Limite de tentativas. | Um token forjado corretamente é aceito (controle). Cada token inválido recebe 401 nas 7 rotas privadas. A conta B recebeu carteira vazia e 404 ao tentar cancelar ou excluir operações de A. A 11ª tentativa errada recebeu 429. O painel não carrega dados sem sessão válida. | Nenhuma |
| Integração Fetch e CORS · 1,0 | `frontend/js/api.js`, `backend/server.js` | Chamadas entre as portas 5173 e 3000, cabeçalho Bearer, preflight, origens recusadas, API desligada, fonte em 429, modo de endereço único na porta 3000. | Preflight 204 para as duas origens configuradas. 403 sem cabeçalhos CORS para origens externas. Console sem erros de CORS. Mensagens claras com a API desligada ou a fonte fora. | Nenhuma |
| Documentação e ZIP · 1,0 | `README.md`, `docs/`, três `.gitignore`, `.env.example`, lockfiles | Inspeção do ZIP, instalação limpa e checagem dos `.gitignore` em uma cópia já usada. | 27 arquivos sob `CambioTrack-Pro/`, sem dependências, Git, banco, logs ou segredos. Na cópia com `node_modules`, `.env` e banco, um Git novo aceitaria exatamente os 27 arquivos-fonte. | Nenhuma |

## Rede externa

Em produção, o serviço consulta `https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL` e espera os objetos USDBRL, EURBRL e BTCBRL com `code`, `codein`, `bid`, `ask` e `timestamp`. A variação `pctChange` é opcional. Esse formato confere com o exemplo da documentação oficial da API de Cotações.

**Tentativa com a fonte real.** O endpoint estava acessível, mas respondeu `{"status":429,"code":"QuotaExceeded","message":"Quota exceeded. To continue using the service, please see https://docs.awesomeapi.com.br/aviso-sobre-limites"}`. A resposta veio tanto desta rede de nuvem quanto de uma ferramenta de busca web com outro endereço de saída, e se repetiu por mais de uma hora. A página indicada na mensagem retorna 404. O processo real, iniciado por `npm start` ou por `npm run start:proxy`, devolveu 502 com a mensagem nova, e o histórico autenticado continuou respondendo 200. **Uma consulta real bem-sucedida não pôde ser confirmada nesta revisão.** Em outra rede, use `GET /api/cotacoes`, conforme o README. Se o 429 ocorrer, tente mais tarde ou configure `AWESOMEAPI_KEY`. A chave gratuita, com 100 mil requisições mensais segundo a documentação, não foi testada com a fonte real.

## Instalação, versões e ZIP

- **Versões.** Em Linux x64, as versões 22.13.0, 22.20.0, 22.21.0, 22.23.5, 24.0.0, 24.5.0, 24.22.3 e 26.13.1 passaram por:
  - `npm ci --engine-strict` com cache vazio nos dois componentes;
  - 26 testes, inclusive com o padrão de arquivos enviado literalmente ao runner, como acontece no `cmd.exe`;
  - inicialização dos dois servidores, cadastro, login e leitura autenticada.

  O 22.12.0 não tem o `node:sqlite` sem opção extra: o `npm ci --engine-strict` recusa a instalação, e a API não inicia. O `npm run start:proxy` exige 22.21.0 ou 24.5.0. No 22.20.0 e no 24.0.0 ele responde `bad option: --use-env-proxy`, como o README descreve. O Node 22 e as versões iniciais do 24 exibem o `ExperimentalWarning` do SQLite. O 24.22.3 e o 26.13.1, não.
- **Bcrypt.** O pacote 6.0.0 traz binários prontos para `win32-x64` e `win32-arm64`. O npm 11.19 e o 11.20 avisam que o script de instalação do bcrypt não foi aprovado (`install-scripts`). Com `npm ci --ignore-scripts`, os 26 testes também passaram nas oito versões, o que mostra que o pacote funciona sem esse script.
- **Comandos do README.** O código JavaScript do comando que cria o `.env` foi executado: ele gera uma chave de 96 caracteres, não sobrescreve um `.env` existente e é lido pelo `--env-file-if-exists`. Os blocos em PowerShell foram revisados linha a linha, mas **não foram executados**: o download do PowerShell foi bloqueado pela política de permissões do ambiente desta revisão. **Windows nativo, Windows PowerShell 5.1 e VS Code no Windows não foram testados.**
- **ZIP.** O arquivo é gerado só com arquivos rastreados pelo Git e tem a raiz `CambioTrack-Pro/`. A inspeção conferiu integridade, ausência de `node_modules`, `.git`, `.env`, bancos, logs, tokens e chaves, e ausência de conteúdo de outros projetos. Depois disso, o pacote foi extraído em diretório limpo e instalado nas oito versões.

## Limitações desta revisão

Não foram executados: Windows nativo e PowerShell, uma consulta real bem-sucedida à AwesomeAPI e ferramentas automáticas de acessibilidade (como axe-core). Leitores de tela não foram testados. O foco do teclado, a navegação por Tab, os rótulos dos campos e as regiões anunciadas foram conferidos no Chromium (checagens N30, N31, N34 a N37, N39, N40 e N42).
