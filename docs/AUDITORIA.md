# Auditoria final do Projeto 02

**19/11/2026 · CEUB · Desenvolvimento Web · Opção B, Câmbio Track Pro.** A revisão partiu da `main` em `cdf9682`, idêntica arquivo a arquivo ao ZIP Full Stack anterior. O edital consultado tem quatro páginas: os requisitos vêm das seções 2 a 5 e os pesos, da seção 6. O prazo do portal é 30/11/2026 às 23h59. Este documento substitui a auditoria anterior e registra apenas o que foi executado nesta revisão.

## Ambiente e método

- **Sistema:** Linux x64. **Navegador:** Chromium 157.0.8103.78, automatizado pelo Playwright 1.63.0.
- **Node.js:** 22.21.0, 22.23.5, 24.5.0, 24.22.3 e 26.13.1, com o npm de cada um (10.9.4 a 11.20.0). O 22.20.0 serviu para confirmar o limite inferior.
- **Três níveis de teste:**
  1. a suíte automatizada (`npm test`);
  2. um ensaio HTTP contra o processo real iniciado com `npm start`, com arquivo SQLite temporário;
  3. um ensaio no navegador com os dois servidores reais, portas 5173 e 3000.
- Nos ensaios 2 e 3, somente a saída HTTPS para a AwesomeAPI recebeu respostas controladas. Express, SQLite, Bcrypt, JWT, CORS e Fetch foram os componentes reais. Respostas simuladas nunca foram tratadas como cotação real.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Suíte automatizada do back-end | **25/25** em cada uma das cinco versões do Node: os 21 testes anteriores, reexecutados sem alteração, e 4 novos. Os 4 novos falham no código anterior e passam no atual. |
| Ensaio HTTP no processo real | **123/123** verificações |
| Ensaio no navegador | **50/50** verificações |
| Valores longos a 320, 360 e 390 px | Nenhum valor quebrado em duas linhas, com BTC a R$ 550 mil e a R$ 1,05 milhão |
| Instalação limpa a partir do ZIP | Aprovada nas cinco versões, com cache npm vazio |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas |
| AwesomeAPI real | HTTP 429 `QuotaExceeded` nesta rede (ver **Rede externa**) |

## Achados e correções

| Prioridade | Constatação reproduzida | Correção e verificação |
| --- | --- | --- |
| Edital, § 5.5 | O edital pede todo o código lógico comentado para leigos. `js/script.js` tinha 7 linhas de comentário em 279, `routes/transacoes.js` 2 em 68, e os HTML não tinham comentários. | Todos os arquivos de lógica do back-end e do front-end receberam comentários didáticos (o `script.js` passou a 120 linhas de comentário), e os HTML ganharam comentários de seção. Uma comparação do código sem comentários, feita com o compilador TypeScript, confirmou código idêntico em sete arquivos. Nos demais, aparecem apenas as correções abaixo. |
| Alta | A AwesomeAPI real respondeu 429 `QuotaExceeded`, e a interface mostrava "AwesomeAPI indisponível (HTTP 429)". Cada prévia consultava a fonte, embora, sem chave, a fonte repita a mesma resposta por 1 minuto. | A mensagem agora explica o limite de uso. A última cotação válida é reaproveitada por 30 s: pedidos simultâneos compartilham uma consulta e falhas não ficam guardadas. Também há a chave opcional `AWESOMEAPI_KEY`, enviada no cabeçalho `x-api-key`. No trecho do roteiro de navegador com digitação e dois registros, as consultas à fonte caíram de 4 para 0. No roteiro completo, caíram de 23 para 4, mesmo com etapas a mais. As fórmulas financeiras não mudaram. |
| Média | Quem usa o teclado perdia o foco, que caía no corpo da página, depois de um login recusado com Enter, depois de registrar uma simulação e ao usar "Atualizar cotações" ou "Atualizar carteira". | O foco volta ao controle de origem. Se a fonte de preços cair, vai para "Tentar novamente". Verificado nas checagens N34 a N37 do navegador. |
| Média | A 320 px, a cotação do BTC quebrava no meio do número nos cartões do histórico: "R$ 550.000,000" numa linha e "0" na seguinte. Com o BTC acima de R$ 1 milhão, o mesmo acontecia nos cartões de cotação. | Até 360 px, os detalhes ficam em uma coluna e os três números grandes usam fonte menor. Sem quebras com valores realistas. Larguras maiores não mudam. |
| Documentação | O README não identificava o autor e não citava o Node 26 LTS, o nome da pasta baixada do GitHub, os avisos esperados no terminal nem o que fazer diante do 429. A auditoria anterior trazia execuções que não foram reproduzidas aqui, como PowerShell 7.6.3 e axe-core. | README revisado com guia para Windows, avisos esperados, tabela de problemas e chave opcional. Esta auditoria substitui a anterior. |

A revisão não encontrou perda de operações, acesso entre contas, falha de autenticação, liberação indevida de CORS nem segredos versionados.

## Matriz do barema

| Critério e peso | Arquivos responsáveis | Testes desta revisão | Evidência | Pendência |
| --- | --- | --- | --- | --- |
| Back-end e API · 2,5 | `backend/server.js`, `routes/auth.js`, `routes/transacoes.js`, `services/` | Suíte e ensaio HTTP com as 10 rotas, entradas válidas e inválidas, JSON malformado, corpo acima de 16 kB, charset errado, IDs inválidos, métodos sem rota e banco bloqueado. | Respostas 201, 200 e 204 nos sucessos. Erros em JSON `{ "erro" }` com 400, 401, 403, 404, 409, 413, 415, 429, 500, 502 e 504. Com o banco bloqueado, 500 genérico sem SQL e recuperação em seguida. Tratamento central de erros e try/catch nas falhas da fonte. | Nenhuma |
| Banco de dados · 2,0 | `backend/database.js`, consultas preparadas em `routes/` | Gravação, leitura, cancelamento e exclusão conferidos também direto no arquivo SQLite. Ctrl+C, novo `npm start`, novo login. Chave estrangeira e e-mail único. | Histórico e resumo idênticos após o reinício. A cotação histórica foi preservada com um preço novo na fonte. A linha excluída deixou de existir no arquivo. O banco recusa operação órfã. | Nenhuma |
| Front-end · 2,0 | `frontend/index.html`, `login.html`, `css/style.css`, `js/` | Fluxos completos no Chromium. Larguras de 320, 390, 768, 1280 e 1920 px no login e no painel. Teclado e foco. | Sem rolagem horizontal nem elementos fora da tela nas cinco larguras. Estados de carregamento, erro, vazio e sucesso. Login completo só com teclado. | Nenhuma |
| JWT e Bcrypt · 1,5 | `backend/middleware/auth.js`, `routes/auth.js` | Hash `$2b$10$` no banco. Senha de 72 bytes mais sufixo recusada. Token ausente, inválido, adulterado, expirado, `alg none`, de outro emissor, sem `exp`, de outra chave e de conta removida. Duas contas. Limite de tentativas. | 401 nas 7 rotas privadas para cada token inválido. A conta B recebeu carteira vazia e 404 ao tentar cancelar ou excluir operações de A. A 11ª tentativa errada recebeu 429. O painel não carrega dados sem sessão válida. | Nenhuma |
| Integração Fetch e CORS · 1,0 | `frontend/js/api.js`, `backend/server.js` | Chamadas entre as portas 5173 e 3000, cabeçalho Bearer, preflight, origens recusadas, API desligada, fonte em 429, modo de endereço único na porta 3000. | Preflight 204 para as duas origens configuradas. 403 sem cabeçalhos CORS para origens externas. Console sem erros de CORS. Mensagens claras com a API desligada ou a fonte fora. | Nenhuma |
| Documentação e ZIP · 1,0 | `README.md`, `docs/`, três `.gitignore`, `.env.example`, lockfiles | Inspeção do ZIP, instalação limpa e checagem dos `.gitignore` em uma cópia já usada. | 27 arquivos sob `CambioTrack-Pro/`, sem dependências, Git, banco, logs ou segredos. Na cópia com `node_modules`, `.env` e banco, um Git novo aceitaria exatamente os 27 arquivos-fonte. | Trocar `Matricula` no nome do ZIP pela matrícula do estudante |

## Rede externa

Em produção, o serviço consulta `https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,BTC-BRL` e espera os objetos USDBRL, EURBRL e BTCBRL com `code`, `codein`, `bid`, `ask` e `timestamp`. A variação `pctChange` é opcional. Esse formato confere com o exemplo da documentação oficial da API de Cotações.

**Tentativa com a fonte real.** O endpoint estava acessível, mas a resposta foi `{"status":429,"code":"QuotaExceeded"}` tanto nesta rede de nuvem quanto por uma ferramenta de busca web com outro endereço de saída. O processo real devolveu 502 com a nova mensagem, e o histórico autenticado continuou respondendo 200. **Uma consulta real bem-sucedida não pôde ser confirmada nesta revisão.** Em outra rede, use `GET /api/cotacoes`, conforme o README. Se o 429 ocorrer, aguarde ou configure `AWESOMEAPI_KEY`. A chave gratuita, com 100 mil requisições mensais segundo a documentação, não foi testada com a fonte real.

## Instalação, versões e ZIP

- **Versões.** Em Linux x64, 22.21.0, 22.23.5, 24.5.0, 24.22.3 e 26.13.1 passaram por:
  - `npm ci --engine-strict` em ambos os componentes;
  - 25 testes, inclusive com o padrão de arquivos enviado literalmente ao runner, como acontece no `cmd.exe`;
  - inicialização dos dois servidores, cadastro, login e leitura autenticada.

  No 22.20.0, o `npm ci --engine-strict` recusou a instalação e o `npm start` falhou com `bad option: --use-env-proxy`, como o README descreve. O Node 22 e o 24.5.0 exibem o `ExperimentalWarning` do SQLite. O 24.22.3 e o 26.13.1, não.
- **Bcrypt.** O pacote 6.0.0 traz binários prontos para `win32-x64` e `win32-arm64`. O npm 11.19 e o 11.20 avisam que o script de instalação do bcrypt não foi aprovado (`install-scripts`). Com `npm ci --ignore-scripts`, os 25 testes também passaram, o que mostra que o pacote funciona sem esse script.
- **Comandos do README.** O código JavaScript do comando que cria o `.env` foi executado: ele gera uma chave de 96 caracteres, não sobrescreve um `.env` existente e é lido pelo `--env-file-if-exists`. Os blocos em PowerShell foram revisados linha a linha, mas **não foram executados**: o download do PowerShell foi bloqueado pela política de permissões do ambiente desta revisão. **Windows nativo, Windows PowerShell 5.1 e VS Code no Windows não foram testados.**
- **ZIP.** O arquivo é gerado só com arquivos rastreados pelo Git e tem a raiz `CambioTrack-Pro/`. A inspeção conferiu integridade, ausência de `node_modules`, `.git`, `.env`, bancos, logs, tokens e chaves, e ausência de conteúdo de outros projetos. Depois disso, o pacote foi extraído em diretório limpo e instalado nas cinco versões. Substitua `Matricula` no nome do arquivo pela matrícula do estudante antes de enviar ao portal.

## Limitações desta revisão

Não foram executados: Windows nativo e PowerShell, uma consulta real bem-sucedida à AwesomeAPI e ferramentas automáticas de acessibilidade (como axe-core). Leitores de tela não foram testados. O foco do teclado, a navegação por Tab, os rótulos e as regiões `aria-live` foram conferidos no Chromium.
