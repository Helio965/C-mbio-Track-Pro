// ==========================================================================
// PAINEL DA CARTEIRA (index.html)
// Fluxo: confere a sessão → busca cotações e histórico na API → mostra a prévia
// enquanto o usuário digita → registra, cancela ou exclui operações → redesenha a tela.
// Todos os cálculos financeiros são feitos pelo servidor; esta página só exibe os resultados.
// Leitura do arquivo:
//   0. estado e formatação     1. mensagens e resultado     2. cotações
//   3. formulário e prévia     4. cartões do histórico      5. carteira (lista e indicadores)
//   6. cancelar e excluir      7. eventos                   8. inicialização
// ==========================================================================
import { api, sair, tokenAtual } from "./api.js";

// ==========================================================================
// 0. ESTADO DA PÁGINA E FORMATAÇÃO
// ==========================================================================

// Atalho para buscar um elemento da página pelo atributo id.
const id = nome => document.getElementById(nome);
const moedas = ["USD", "EUR", "BTC"];
// Formatadores do padrão brasileiro: data/hora de Brasília e percentual com vírgula.
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo"
});
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });
let cotacoes = null;    // últimas cotações válidas recebidas (null = indisponíveis)
let gravando = false;   // true enquanto um registro está sendo enviado (evita clique duplo)
let versaoPrevia = 0;   // número da prévia mais recente (descarta respostas antigas)
let temporizador;       // espera curta entre a digitação e o pedido de prévia

/**
 * Formata valores no padrão brasileiro.
 * @param {number|string} valor Número ou texto decimal vindo da API.
 * @param {string} codigo BRL, USD, EUR ou BTC (BTC é exibido com até 8 casas).
 * @param {boolean} cotacao true para mostrar preços com 4 a 8 casas decimais.
 * @returns {string} Ex.: "R$ 1.234,56", "US$ 10,00", "0,00123456 BTC".
 */
function moeda(valor, codigo = "BRL", cotacao = false) {
  if (codigo === "BTC") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(valor) + " BTC";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: codigo,
    minimumFractionDigits: cotacao ? 4 : 2, maximumFractionDigits: cotacao ? 8 : 2
  }).format(valor);
}
// A API envia reais em centavos inteiros (5074 = R$ 50,74).
const reais = centavos => moeda(centavos / 100);
// O que o usuário recebe: na compra, unidades do ativo; na venda, reais líquidos.
const recebido = op => op.tipo === "COMPRA" ? moeda(op.quantidade_ativo, op.ativo) : reais(op.liquido_centavos);

// ==========================================================================
// 1. MENSAGENS, FOCO E QUADRO "RESULTADO ESTIMADO"
// ==========================================================================

/** Escreve um aviso e marca seu estado ("carregando", "sucesso" ou "erro") para o CSS. */
function mensagem(elemento, texto, estado = "") {
  elemento.textContent = texto;
  elemento.dataset.estado = estado;
}

/** Mostra (ou esconde, se vazio) o erro logo abaixo do campo de valor. */
function erroFormulario(texto = "") {
  id("erro-formulario").textContent = texto;
  id("erro-formulario").hidden = !texto;
}

/**
 * Desativar um botão ou campo que está com o foco faz o navegador "soltar" o foco no
 * corpo da página. Nesse caso, o foco volta para o elemento indicado, e quem navega
 * pelo teclado continua de onde parou. A página não rola (preventScroll), para não
 * tirar do lugar quem rolou a tela durante a espera. Use rolar = true quando o foco
 * vai para outro controle, como "Tentar novamente".
 */
function devolverFoco(elemento, rolar = false) {
  const foco = document.activeElement;
  if ((!foco || foco === document.body) && elemento && elemento !== document.body && elemento.isConnected) {
    elemento.focus({ preventScroll: !rolar });
  }
}

/**
 * Preenche o quadro de resultado com uma operação calculada pela API.
 * @param {object|null} op Operação (null limpa o quadro e mostra traços).
 * @param {string} aviso Texto de orientação exibido abaixo dos valores.
 */
function renderizarResultado(op, aviso) {
  id("resumo-origem").textContent = op ? moeda(op.montante, op.moeda_origem) + " → " + op.moeda_destino : "Informe um valor no conversor";
  id("resultado-liquido").textContent = op ? recebido(op) : "—";
  id("resultado-cotacao").textContent = op ? moeda(op.cotacao, "BRL", true) : "—";
  id("resultado-bruto").textContent = op ? reais(op.bruto_centavos) : "—";
  id("resultado-taxa").textContent = op ? reais(op.taxa_centavos) : "—";
  id("aviso-resultado").textContent = aviso;
}

// ==========================================================================
// 2. COTAÇÕES (AwesomeAPI, entregues pela rota GET /api/cotacoes do servidor)
// ==========================================================================

// A resposta do servidor contém os preços nas duas direções e a data da fonte.
// bid = preço para vender o ativo; ask = preço para comprá-lo.
function renderizarCotacoes() {
  for (const codigo of moedas) {
    const item = cotacoes?.[codigo];
    id("cotacao-" + codigo).textContent = item ? moeda(item.bid, "BRL", true) : "—";
    id("ask-" + codigo).textContent = item ? moeda(item.ask, "BRL", true) : "—";
    id("data-" + codigo).textContent = item ? "Cotação de " + dataHora.format(new Date(item.data)) : "Sem cotação";
    // A variação do dia ganha cor verde (alta) ou vermelha (queda) pelas classes do CSS.
    const variacao = id("variacao-" + codigo);
    variacao.className = "variacao";
    variacao.textContent = "—";
    if (Number.isFinite(item?.variacao)) {
      variacao.textContent = (item.variacao > 0 ? "+" : "") + percentual.format(item.variacao / 100);
      variacao.classList.add(item.variacao >= 0 ? "positiva" : "negativa");
    }
    variacao.setAttribute("aria-label", "Variação: " + variacao.textContent);
  }
}

/**
 * Chamada quando a fonte de preços falha: apaga os preços da tela e bloqueia o
 * formulário, pois nenhuma operação pode usar preço desconhecido. O histórico continua visível.
 */
function invalidarCotacoes(erro) {
  cotacoes = null;
  id("campos-conversao").disabled = true;
  renderizarCotacoes();
  renderizarResultado(null, "Atualize as cotações para simular.");
  mensagem(id("status-api"), erro.message, "erro");
  id("rotulo-atualizar").textContent = "Tentar novamente";
}

/**
 * Busca as cotações na API com Fetch (async/await) e atualiza os cartões.
 * Enquanto carrega: botão e formulário desativados e aviso "Consultando cotações…".
 * try/catch/finally garante que a tela volte a um estado coerente com ou sem erro.
 */
async function buscarCotacoes() {
  const botao = id("atualizar-cotacoes");
  const focoAnterior = document.activeElement;
  botao.disabled = true;
  cotacoes = null;
  limparPrevia();
  id("campos-conversao").disabled = true;
  id("secao-cotacoes").setAttribute("aria-busy", "true");
  id("rotulo-atualizar").textContent = "Atualizando…";
  mensagem(id("status-api"), "Consultando cotações…", "carregando");
  renderizarResultado(null, "Aguarde a consulta das cotações.");
  try {
    cotacoes = await api("cotacoes");
    renderizarCotacoes();
    id("rotulo-atualizar").textContent = "Atualizar cotações";
    mensagem(id("status-api"), "Cotações carregadas.", "sucesso");
    atualizarPrevia();
  } catch (erro) {
    invalidarCotacoes(erro);
  } finally {
    botao.disabled = false;
    id("campos-conversao").disabled = !cotacoes || gravando;
    id("secao-cotacoes").setAttribute("aria-busy", "false");
    devolverFoco(focoAnterior);
  }
}

// ==========================================================================
// 3. FORMULÁRIO E PRÉVIA (POST /api/transacoes/previa, sem gravar)
// ==========================================================================

/** Lê o formulário. A vírgula decimal é trocada por ponto: "10,25" → "10.25". */
function entrada() {
  return {
    tipo: id("tipo").value, ativo: id("moeda-origem").value,
    montante: id("montante").value.trim().replace(",", ".")
  };
}

/** Cancela a prévia agendada e invalida respostas de prévias anteriores. */
function limparPrevia() {
  clearTimeout(temporizador);
  versaoPrevia++;
}

/**
 * Executada a cada digitação ou troca de opção. Valida o valor no navegador
 * (resposta imediata) e, se estiver correto, pede ao servidor o cálculo da prévia.
 */
function atualizarPrevia() {
  limparPrevia();
  const versao = versaoPrevia;
  const dados = entrada();
  // Na compra o usuário digita reais; na venda, unidades do ativo.
  const origem = dados.tipo === "COMPRA" ? "BRL" : dados.ativo;
  const casas = origem === "BTC" ? 8 : 2;
  id("unidade-montante").textContent = origem;
  id("ajuda-montante").textContent = "Informe até " + casas + " casas decimais, sem separador de milhar.";
  // Expressão regular: só dígitos, com ponto e até "casas" decimais (ex.: 100 ou 100.50).
  const formato = new RegExp("^\\d+(?:\\.\\d{1," + casas + "})?$");
  const invalido = dados.montante && (!formato.test(dados.montante) || +dados.montante <= 0 || +dados.montante > 1e9);
  const aviso = invalido ? "Use um valor positivo de até 1 bilhão com até " + casas + " casas decimais." : "";
  // setCustomValidity faz a validação nativa do navegador bloquear o envio com este aviso.
  id("montante").setCustomValidity(aviso);
  id("montante").setAttribute("aria-invalid", String(Boolean(invalido)));
  erroFormulario(aviso);
  renderizarResultado(null, "A estimativa aparece antes do registro.");
  if (!dados.montante || invalido || !cotacoes) return;

  // Uma edição pode ocorrer enquanto a prévia anterior está em trânsito.
  // O número de versão impede que a resposta antiga sobrescreva a mais recente.
  // A espera de 350 ms evita um pedido a cada tecla digitada.
  renderizarResultado(null, "Calculando estimativa…");
  temporizador = setTimeout(async () => {
    try {
      const op = await api("transacoes/previa", { metodo: "POST", corpo: dados });
      if (versao === versaoPrevia) renderizarResultado(op, "O valor final é calculado pelo servidor ao registrar.");
    } catch (erro) {
      if (versao !== versaoPrevia) return;
      // 502/504: a fonte de preços falhou. O formulário é bloqueado e o foco vai para "Tentar novamente".
      if ([502, 504].includes(erro.status)) {
        invalidarCotacoes(erro);
        devolverFoco(id("atualizar-cotacoes"), true);
      } else renderizarResultado(null, "Estimativa indisponível.");
      erroFormulario(erro.message);
    }
  }, 350);
}

// ==========================================================================
// 4. CARTÕES DO HISTÓRICO (criados com createElement e append)
// ==========================================================================

// A fábrica de cards do Projeto 01 agora recebe os valores gravados no SQLite.
// textContent exibe os dados como texto, sem interpretar marcação recebida.
function criarElemento(tag, classe = "", texto = "") {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  no.textContent = texto;
  return no;
}

/**
 * Monta o cartão de uma operação gravada: título, status, data, valores e botões.
 * Operações canceladas ganham a classe "cancelada" e só oferecem "Excluir".
 * @param {object} op Linha da tabela transacoes devolvida pela API.
 * @returns {HTMLElement} Elemento <article> pronto para entrar na lista.
 */
function criarCardOperacao(op) {
  const cancelada = op.status === "CANCELADA";
  const card = criarElemento("article", "operacao" + (cancelada ? " cancelada" : ""));
  const cabecalho = criarElemento("div", "operacao-cabecalho");
  const nomeTipo = op.tipo === "COMPRA" ? "Compra" : "Venda";
  const titulo = criarElemento("h3", "", "#" + op.id + " · " + nomeTipo + " de " + op.ativo);
  titulo.id = "titulo-operacao-" + op.id;
  // tabIndex -1 permite mover o foco para o título depois de cancelar.
  titulo.tabIndex = -1;
  card.setAttribute("aria-labelledby", titulo.id);
  const identificacao = criarElemento("div", "operacao-identificacao");
  identificacao.append(titulo, criarElemento("span", "status-operacao", cancelada ? "Cancelada" : "Ativa"));
  const horario = criarElemento("time", "operacao-data", dataHora.format(new Date(op.criado_em)));
  horario.dateTime = op.criado_em;
  cabecalho.append(identificacao, horario);
  // Lista de detalhes (<dl>): cada par rótulo/valor vira um <dt> e um <dd>.
  const detalhes = criarElemento("dl", "operacao-detalhes");
  const itens = [
    ["Valor informado", moeda(op.montante, op.moeda_origem)],
    ["Cotação utilizada", moeda(op.cotacao, "BRL", true)],
    ["Spread (" + percentual.format(op.spread) + ")", reais(op.taxa_centavos)],
    ["Você recebe", recebido(op)]
  ];
  for (const [rotulo, valor] of itens) {
    const grupo = criarElemento("div");
    grupo.append(criarElemento("dt", "", rotulo), criarElemento("dd", "", valor));
    detalhes.append(grupo);
  }
  const rodape = criarElemento("div", "operacao-rodape");
  rodape.append(criarElemento("p", "operacao-nota", "Bruto: " + reais(op.bruto_centavos) + " · Cotação de " + dataHora.format(new Date(op.data_cotacao))));
  // Botões de ação. O aria-label informa a leitores de tela qual operação será afetada.
  const acoes = criarElemento("div", "acoes");
  for (const acao of (cancelada ? ["excluir"] : ["cancelar", "excluir"])) {
    const texto = acao === "excluir" ? "Excluir" : "Cancelar";
    const botao = criarElemento("button", "btn-secondary botao-" + acao, texto);
    botao.type = "button";
    botao.setAttribute("aria-label", texto + " operação " + op.id);
    botao.addEventListener("click", () => alterarOperacao(op.id, acao));
    acoes.append(botao);
  }
  rodape.append(acoes);
  card.append(cabecalho, detalhes, rodape);
  return card;
}

// ==========================================================================
// 5. CARTEIRA: HISTÓRICO E INDICADORES (GET /api/transacoes e /resumo)
// ==========================================================================

let buscaCarteira = 0; // número da consulta mais recente; respostas antigas são ignoradas
/**
 * Busca histórico e indicadores ao mesmo tempo (Promise.all) e redesenha a lista.
 * Os totais vêm do banco: a página não soma nada por conta própria.
 * @param {string} confirmacao Mensagem de sucesso exibida após a atualização.
 */
async function atualizarCarteira(confirmacao = "") {
  const versao = ++buscaCarteira;
  const focoAnterior = document.activeElement;
  id("atualizar-carteira").disabled = true;
  mensagem(id("mensagem-operacao"), "Carregando carteira…");
  try {
    const [historico, resumo] = await Promise.all([api("transacoes"), api("transacoes/resumo")]);
    if (versao !== buscaCarteira) return;
    // replaceChildren troca todos os cartões antigos pelos novos de uma só vez.
    id("lista-operacoes").replaceChildren(...historico.map(criarCardOperacao));
    id("historico-vazio").hidden = historico.length > 0;
    id("total-operacoes").textContent = resumo.total;
    id("operacoes-ativas").textContent = resumo.ativas;
    id("total-movimentado").textContent = reais(resumo.movimentado_centavos);
    mensagem(id("mensagem-operacao"), confirmacao, "sucesso");
  } catch (erro) {
    if (versao === buscaCarteira) {
      mensagem(id("mensagem-operacao"), [confirmacao, "Falha ao atualizar a carteira.", erro.message].filter(Boolean).join(" "), "erro");
    }
  } finally {
    if (versao === buscaCarteira) {
      id("atualizar-carteira").disabled = false;
      devolverFoco(focoAnterior);
    }
  }
}

// ==========================================================================
// 6. CANCELAR (PATCH) E EXCLUIR (DELETE) UMA OPERAÇÃO
// ==========================================================================

/**
 * Cancela ou exclui a operação e depois recarrega a carteira.
 * A exclusão pede confirmação, pois remove o registro definitivamente.
 * @param {number} numero Identificador da operação.
 * @param {string} acao "cancelar" ou "excluir".
 */
async function alterarOperacao(numero, acao) {
  const excluir = acao === "excluir";
  if (excluir && !window.confirm("Excluir definitivamente a operação #" + numero + "?")) return;
  const focoAnterior = document.activeElement;
  // Desativa os botões do cartão para impedir dois cliques seguidos.
  const botoes = id("titulo-operacao-" + numero).closest("article").querySelectorAll("button");
  botoes.forEach(botao => { botao.disabled = true; });
  try {
    if (excluir) await api("transacoes/" + numero, { metodo: "DELETE" });
    else await api("transacoes/" + numero + "/cancelar", { metodo: "PATCH" });
    await atualizarCarteira("Operação #" + numero + (excluir ? " excluída." : " cancelada."));
    // O botão clicado deixou de existir; o foco vai para o título do cartão (ou do histórico).
    const destino = id("titulo-operacao-" + numero) || id("titulo-historico");
    destino.focus({ preventScroll: true });
  } catch (erro) {
    mensagem(id("mensagem-operacao"), erro.message, "erro");
  } finally {
    botoes.forEach(botao => { botao.disabled = false; });
    devolverFoco(focoAnterior);
  }
}

// ==========================================================================
// 7. EVENTOS
// ==========================================================================

// Registrar simulação (POST /api/transacoes): o servidor obtém a cotação (a última consulta
// válida à AwesomeAPI é reaproveitada por até 30 s), calcula e grava no SQLite.
id("formulario-conversao").addEventListener("submit", async evento => {
  // Impede o recarregamento da página; o envio é feito pelo fetch.
  evento.preventDefault();
  // Ignora um segundo envio enquanto o primeiro ainda não terminou.
  if (gravando || !cotacoes) return;
  gravando = true;
  const focoAnterior = document.activeElement;
  limparPrevia();
  erroFormulario();
  id("campos-conversao").disabled = true;
  id("atualizar-cotacoes").disabled = true;
  id("registrar-operacao").textContent = "Registrando…";
  try {
    const op = await api("transacoes", { metodo: "POST", corpo: entrada() });
    renderizarResultado(op, "Simulação #" + op.id + " registrada.");
    await atualizarCarteira("Simulação #" + op.id + " registrada no histórico.");
  } catch (erro) {
    if ([502, 504].includes(erro.status)) invalidarCotacoes(erro);
    erroFormulario(erro.message);
  } finally {
    gravando = false;
    id("campos-conversao").disabled = !cotacoes;
    id("atualizar-cotacoes").disabled = false;
    id("registrar-operacao").textContent = "Registrar simulação";
    // Se a fonte de preços falhou, o formulário segue bloqueado e o foco vai para "Tentar novamente".
    devolverFoco(cotacoes ? focoAnterior : id("atualizar-cotacoes"), !cotacoes);
  }
});

// Qualquer mudança no valor, no tipo ou no ativo recalcula a prévia.
id("montante").addEventListener("input", atualizarPrevia);
id("tipo").addEventListener("change", atualizarPrevia);
id("moeda-origem").addEventListener("change", atualizarPrevia);
id("atualizar-carteira").addEventListener("click", () => atualizarCarteira());
id("atualizar-cotacoes").addEventListener("click", buscarCotacoes);
id("sair").addEventListener("click", () => sair());
id("titulo-historico").tabIndex = -1;

// ==========================================================================
// 8. INICIALIZAÇÃO
// ==========================================================================

// Só pedimos dados privados depois de o servidor validar a sessão. A consulta
// do histórico é independente da AwesomeAPI para funcionar durante falhas externas.
async function iniciar() {
  // Sem token: nem tenta carregar a carteira, volta para o login.
  if (!tokenAtual()) return sair();
  try {
    // GET /api/auth/me confirma o token. Se ele for inválido, api() leva ao login.
    const { usuario } = await api("auth/me");
    id("usuario").textContent = usuario.nome;
    id("conteudo").hidden = false;
    id("status-painel").hidden = true;
    // Histórico e cotações são buscados em paralelo; um não espera o outro.
    await Promise.all([atualizarCarteira(), buscarCotacoes()]);
  } catch (erro) {
    id("status-painel").textContent = erro.message + " Recarregue a página para tentar novamente.";
  }
}

iniciar();
