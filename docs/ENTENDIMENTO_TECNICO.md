# Como uma simulação chega à carteira

Imagine que a pessoa queira vender USD 100. O formulário conhece o ativo e o montante. Quem conhece a conta é o servidor, a partir do token apresentado. Quem informa o preço é a AwesomeAPI. O banco reúne essas três informações no instante do registro, o que permite reconstruir a simulação meses depois.

## Do Projeto 01 ao Projeto 02

A base examinada foi o ZIP original com quatro arquivos. O `index.html` organizava cotações, formulário, resultado estimado, indicadores e histórico. `css/style.css` definia o cabeçalho azul, os cartões, o Grid e as adaptações para dispositivos móveis. `js/script.js` concentrava tanto a apresentação quanto as regras financeiras. O README original descrevia essas regras e informava que a carteira era apagada ao recarregar a página.

| Ponto de partida no script original | Responsabilidade no Projeto 02 |
| --- | --- |
| `CONFIG` e `buscarCotacoes()` definem os pares, o limite de tempo e validam a resposta externa | `backend/services/cotacoes.js` consulta os mesmos três pares, exige data e preços de compra e venda válidos e fornece os valores aos cálculos e ao painel. |
| `OperacaoCambio` valida o montante, calcula bruto, taxa e líquido e conserva a cotação de origem | `backend/services/cambioService.js` valida a entrada, escolhe o preço pelo sentido da operação e calcula com precisão decimal. Uma linha de `transacoes` conserva a cotação efetivamente usada. |
| `CarteiraFinanceira` guarda registros em um array privado e soma as operações ativas | `backend/routes/transacoes.js` consulta a carteira pelo dono. O SQLite atribui o identificador, preserva o status e calcula o volume bruto das ativas. |
| Listeners validam o formulário, atualizam a prévia e chamam `renderizarInterface()` | A interface mantém o formulário com prévia e cartões. Os eventos agora chamam a API. A listagem e os indicadores refletem respostas do servidor. |
| `criarCardOperacao()` representa no DOM os registros ativos e os cancelados | O painel continua criando elementos e preenchendo texto a partir dos dados. A tela passa a oferecer exclusão permanente além do cancelamento. |

Na migração, os riscos principais eram inverter a perspectiva de compra e venda, somar ativos em unidades incompatíveis, perder precisão do BTC, recalcular registros antigos com preços novos ou apresentar dados de outra conta. A escolha de `bid`/`ask`, os centavos inteiros, a cotação gravada e o filtro por usuário resolvem problemas diferentes.

## Cliente, servidor e API

**Full Stack** aqui abrange três partes. O navegador apresenta e recebe informações. O servidor aplica as regras. O banco conserva os dados. O **Node.js** executa JavaScript no servidor, com acesso ao arquivo SQLite e à chave de assinatura. O **Express** associa combinações de método HTTP e caminho a funções e permite encadear verificações comuns, chamadas *middleware*.

```text
Usuário
  ↓ informa tipo, ativo e montante
Front-end (formulário)
  ↓ Fetch + JWT no cabeçalho Authorization
Express
  ↓ middleware de autenticação verifica quem fez o pedido
Rotas e lógica de negócio ← preços e horário da AwesomeAPI
  ↓ INSERT com o identificador da conta autenticada
SQLite
  ↓ linha gravada
Resposta JSON
  ↓ novo histórico e resumo
Atualização da interface
```

Em uma **API RESTful**, o endereço identifica um recurso ou uma coleção e o método expressa a operação. Neste projeto, `GET /api/transacoes` lê a lista e `POST /api/transacoes` cria um registro. Use `PATCH /api/transacoes/:id/cancelar` para mudar o status e `DELETE /api/transacoes/:id` para remover o registro. O código de resposta distingue, por exemplo, uma criação (201) de uma exclusão cujo corpo está vazio (204). A rota de prévia recebe o formulário por POST e devolve os cálculos antes de qualquer gravação.

## Identidade, autorização e senha

1. **Cadastro.** A rota elimina espaços externos do nome e do e-mail, converte o e-mail para minúsculas e valida os campos. O Bcrypt usa um *salt* aleatório e custo 10 para calcular o hash da senha. Duas contas com a mesma senha podem ter hashes diferentes. A restrição `UNIQUE` protege o e-mail inclusive quando dois cadastros chegam juntos.
2. **Login.** O servidor encontra a conta por e-mail e usa `bcrypt.compare` para verificar a senha contra o hash. Isso comprova a identidade e recebe o nome de **autenticação**. Uma falha tem resposta genérica. O servidor limita tentativas por IP para reduzir repetição rápida de palpites.
3. **Sessão.** Após a autenticação, o servidor assina um JWT com HS256 e uma chave do ambiente. O token contém identificador de usuário (`sub`), data de criação da conta (`criado_em`), emissor e tempos de emissão e expiração. A assinatura permite detectar alterações. Como o conteúdo é legível, a senha e o hash ficam fora do token.
4. **Pedido privado.** O navegador retém o JWT em `sessionStorage` e o envia no cabeçalho Bearer. O middleware verifica a assinatura, o algoritmo, o emissor, a validade de uma hora e se a conta existe e é a mesma que recebeu o token. A comparação da data de criação impede que, depois de o banco ser apagado e recriado, um token antigo abra a conta nova que receber o mesmo número. Uma sessão ausente ou expirada recebe 401. O painel encaminha a pessoa ao login.
5. **Autorização.** Depois de saber quem pediu, a rota verifica o que essa pessoa pode fazer. Uma atualização inclui `WHERE id = ? AND usuario_id = ?`. O segundo parâmetro vem da conta autenticada. Mesmo conhecendo o número de outra operação, uma conta não consegue lê-la ou alterá-la. A resposta 404 preserva a privacidade da existência do registro.
6. **Saída.** O logout remove o token da aba. O servidor continuaria aceitando uma cópia válida até expirar. O armazenamento de sessão permite recarregar a página. Uma falha de XSS, se existisse, poderia expor esse token a um script da mesma origem. No painel, dados de usuário e da fonte entram como texto em elementos do DOM.

CORS controla quais origens o navegador pode usar para ler a resposta de outra origem. No desenvolvimento, as portas 5173 e 3000 já formam origens distintas. O servidor anuncia métodos e cabeçalhos permitidos, inclusive `Authorization`. Já a autorização por usuário precisa funcionar para qualquer cliente HTTP, inclusive clientes de terminal.

## A matemática de uma venda e de uma compra

Todos os números desta seção são **didáticos**. Considere um par USD/BRL em que a instituição pague R$ 5,00 por dólar (`bid`) e venda a R$ 5,10 (`ask`). A diferença natural dos dois preços vem da fonte. Além dela, a simulação aplica a taxa didática chamada spread, de 1% do bruto.

**Venda de USD 100,00.** O bruto é 100 × 5,00 = R$ 500,00, a taxa é R$ 5,00 e o líquido recebido é **R$ 495,00**. O registro conserva `bruto_centavos = 50000`, `taxa_centavos = 500` e `liquido_centavos = 49500`.

**Compra com R$ 510,00.** O bruto corresponde aos R$ 510,00 informados, a taxa é R$ 5,10 e os R$ 504,90 líquidos compram **USD 99,00** ao preço de R$ 5,10. Na compra, “líquido” é o orçamento em reais após a taxa. “Quantidade do ativo” informa quantas unidades foram adquiridas. Quando a divisão tem mais casas do que o ativo admite, a quantidade é truncada. Eventual fração submínima fica fora da quantidade exibida.

**Precisão.** Uma entrada decimal como `"1.15"` é tratada como 115 unidades em escala 100. O código usa `BigInt` para multiplicar e dividir inteiros. Numa venda de 1,15 unidade a R$ 5,10, o bruto exato de R$ 5,865 resulta em R$ 5,87. A taxa é arredondada para centavos e o líquido é a diferença dos dois inteiros. USD e EUR permitem duas casas, BTC permite oito e o BRL usa centavos. Se a compra gerasse zero unidades na precisão do ativo, o serviço rejeitaria a simulação.

**Indicadores.** Ao registrar as duas operações dos exemplos, o contador total vale 2, as ativas somam 2 e o volume bruto em reais é R$ 1.010,00. Cancelar a venda deixa o total em 2, as ativas em 1 e o volume em R$ 510,00. Se excluir a venda cancelada, o total cai para 1. O preço de hoje não entra nessas contas. A consulta usa os campos gravados em cada operação.

## Por que o histórico sobrevive ao reinício

SQLite é um banco relacional incorporado ao processo do servidor. As tabelas e os índices vivem em um arquivo. `backend/database.js` habilita as chaves estrangeiras a cada conexão e cria a estrutura quando necessário. A chave primária `usuarios.id` identifica uma conta. A chave estrangeira `transacoes.usuario_id` exige que cada operação aponte para uma conta existente. A relação permite várias operações para um usuário.

| Tabela | Campos essenciais |
| --- | --- |
| `usuarios` | `id`, `nome`, `email` único, `senha_hash`, `criado_em` |
| `transacoes` | `id`, `usuario_id`, `tipo`, `ativo`, `moeda_origem`, `moeda_destino`, `montante`, `cotacao`, `spread`, `bruto_centavos`, `taxa_centavos`, `liquido_centavos`, `quantidade_ativo`, `status`, `data_cotacao`, `criado_em` |

Os campos em centavos facilitam somar valores exatos. Textos decimais preservam o preço original e as oito casas do BTC. `data_cotacao` é o horário da fonte e `criado_em` indica quando a aplicação gravou. O índice de usuário e identificador ajuda a listar as operações de uma conta, da mais nova à mais antiga. Nas consultas preparadas, o driver associa valores aos parâmetros, evitando interpretar dados de entrada como instruções SQL.

Ao abrir novamente o painel, a API lê o mesmo arquivo e envia os registros. Se a aplicação passar a usar outro caminho de banco, a carteira consultada também será outra. Um banco em memória é adequado a testes isolados. Para demonstrar persistência, o teste precisa reabrir um arquivo real.

## Dados, tela e indisponibilidade da fonte

A camada `frontend/js/api.js` centraliza o cabeçalho de autorização, a URL, a interpretação de JSON e os erros HTTP. O painel valida a sessão e consulta os dados privados. Os formulários usam eventos, e `fetch` com `await` permite indicar carregamento enquanto se aguarda a resposta. O código da interface converte respostas em cartões e mensagens acessíveis. O SQLite permanece a fonte da listagem e dos indicadores.

Ao pedir cotações, o servidor consulta USD/BRL, EUR/BRL e BTC/BRL no mesmo pedido HTTPS. Verifica os pares, os dois preços e a data da fonte antes de responder. A variação percentual, quando ausente, pode aparecer como traço. A prévia e o registro usam o mesmo cálculo no back-end. O formulário fornece somente tipo, ativo e montante. A cotação vista anteriormente nunca autoriza, por si só, uma nova gravação.

Uma demora além de 12 segundos interrompe o pedido à fonte. Um erro externo ou um preço inválido impede gravar o registro. O histórico, o cancelamento, a exclusão e o resumo usam somente a base local, portanto continuam disponíveis quando as cotações falham. A consulta é sob demanda, com o horário retornado pela fonte. Uma nova consulta pode devolver o mesmo preço.

Sem chave, a AwesomeAPI repete a mesma resposta durante 1 minuto e pode recusar consultas por limite de uso, respondendo HTTP 429 (`QuotaExceeded`). Por isso `criarConsultaComCache()`, em `backend/services/cotacoes.js`, reaproveita a última cotação válida por até 30 segundos: a prévia, que roda a cada pausa na digitação, deixa de gastar a cota sem ganhar preço mais novo. Pedidos simultâneos compartilham uma consulta, e uma falha nunca fica guardada. A idade é medida pelo relógio do computador: se ele voltar no tempo ou saltar (por exemplo, depois de uma suspensão), a fonte é consultada de novo. Se o limite for atingido, a mensagem explica o motivo, e a variável opcional `AWESOMEAPI_KEY` envia a chave gratuita da fonte no cabeçalho `x-api-key`.

## Roteiro para explicar o projeto

1. Faça login e acompanhe as chamadas na aba de rede do navegador. Identifique quais respostas são públicas e quais solicitam o JWT. Preserve a privacidade do token ao compartilhar a tela.
2. Compare a prévia com o registro. Observe em qual dos dois pedidos aparece o identificador persistido. Localize a decisão correspondente em `backend/routes/transacoes.js`.
3. Use a mesma cotação didática nos exemplos acima para refazer as contas à mão e confira a política de arredondamento em `backend/services/cambioService.js`.
4. Demonstre cancelamento e exclusão. Explique por que as duas ações têm efeitos diferentes sobre a contagem de registros.
5. Reinicie com o mesmo arquivo de banco, entre novamente e localize o horário e a cotação que ficaram salvos. Conecte essa observação ao `INSERT` do registro e ao `SELECT` usado pelo histórico.

O inventário do projeto e os comandos para instalar, iniciar e testar estão no [README](../README.md). A cobertura efetivamente verificada e suas limitações estão na [auditoria](AUDITORIA.md).
