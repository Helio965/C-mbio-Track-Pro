import { api, sair, tokenAtual } from "./api.js";

const id = nome => document.getElementById(nome);
const moedas = ["USD", "EUR", "BTC"];
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo"
});
const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });
let cotacoes = null;
let gravando = false;
let versaoPrevia = 0;
let temporizador;

function moeda(valor, codigo = "BRL", cotacao = false) {
  if (codigo === "BTC") return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(valor) + " BTC";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: codigo,
    minimumFractionDigits: cotacao ? 4 : 2, maximumFractionDigits: cotacao ? 8 : 2
  }).format(valor);
}
const reais = centavos => moeda(centavos / 100);
const recebido = op => op.tipo === "COMPRA" ? moeda(op.quantidade_ativo, op.ativo) : reais(op.liquido_centavos);

function mensagem(elemento, texto, estado = "") {
  elemento.textContent = texto;
  elemento.dataset.estado = estado;
}

function erroFormulario(texto = "") {
  id("erro-formulario").textContent = texto;
  id("erro-formulario").hidden = !texto;
}

function renderizarResultado(op, aviso) {
  id("resumo-origem").textContent = op ? moeda(op.montante, op.moeda_origem) + " → " + op.moeda_destino : "Informe um valor no conversor";
  id("resultado-liquido").textContent = op ? recebido(op) : "—";
  id("resultado-cotacao").textContent = op ? moeda(op.cotacao, "BRL", true) : "—";
  id("resultado-bruto").textContent = op ? reais(op.bruto_centavos) : "—";
  id("resultado-taxa").textContent = op ? reais(op.taxa_centavos) : "—";
  id("aviso-resultado").textContent = aviso;
}

// A resposta do servidor contém os preços nas duas direções e a data da fonte.
function renderizarCotacoes() {
  for (const codigo of moedas) {
    const item = cotacoes?.[codigo];
    id("cotacao-" + codigo).textContent = item ? moeda(item.bid, "BRL", true) : "—";
    id("ask-" + codigo).textContent = item ? moeda(item.ask, "BRL", true) : "—";
    id("data-" + codigo).textContent = item ? "Cotação de " + dataHora.format(new Date(item.data)) : "Sem cotação";
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

function invalidarCotacoes(erro) {
  cotacoes = null;
  id("campos-conversao").disabled = true;
  renderizarCotacoes();
  renderizarResultado(null, "Atualize as cotações para simular.");
  mensagem(id("status-api"), erro.message, "erro");
  id("rotulo-atualizar").textContent = "Tentar novamente";
}

async function buscarCotacoes() {
  const botao = id("atualizar-cotacoes");
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
  }
}

function entrada() {
  return {
    tipo: id("tipo").value, ativo: id("moeda-origem").value,
    montante: id("montante").value.trim().replace(",", ".")
  };
}

function limparPrevia() {
  clearTimeout(temporizador);
  versaoPrevia++;
}

function atualizarPrevia() {
  limparPrevia();
  const versao = versaoPrevia;
  const dados = entrada();
  const origem = dados.tipo === "COMPRA" ? "BRL" : dados.ativo;
  const casas = origem === "BTC" ? 8 : 2;
  id("unidade-montante").textContent = origem;
  id("ajuda-montante").textContent = "Informe até " + casas + " casas decimais, sem separador de milhar.";
  const formato = new RegExp("^\\d+(?:\\.\\d{1," + casas + "})?$");
  const invalido = dados.montante && (!formato.test(dados.montante) || +dados.montante <= 0 || +dados.montante > 1e9);
  const aviso = invalido ? "Use um valor positivo de até 1 bilhão com até " + casas + " casas decimais." : "";
  id("montante").setCustomValidity(aviso);
  id("montante").setAttribute("aria-invalid", String(Boolean(invalido)));
  erroFormulario(aviso);
  renderizarResultado(null, "A estimativa aparece antes do registro.");
  if (!dados.montante || invalido || !cotacoes) return;

  // Uma edição pode ocorrer enquanto a prévia anterior está em trânsito.
  // O número de versão impede que a resposta antiga sobrescreva a mais recente.
  renderizarResultado(null, "Calculando estimativa…");
  temporizador = setTimeout(async () => {
    try {
      const op = await api("transacoes/previa", { metodo: "POST", corpo: dados });
      if (versao === versaoPrevia) renderizarResultado(op, "A cotação será consultada novamente ao registrar.");
    } catch (erro) {
      if (versao !== versaoPrevia) return;
      if ([502, 504].includes(erro.status)) invalidarCotacoes(erro);
      else renderizarResultado(null, "Estimativa indisponível.");
      erroFormulario(erro.message);
    }
  }, 350);
}

// A fábrica de cards do Projeto 01 agora recebe os valores gravados no SQLite.
// textContent exibe os dados como texto, sem interpretar marcação recebida.
function criarElemento(tag, classe = "", texto = "") {
  const no = document.createElement(tag);
  if (classe) no.className = classe;
  no.textContent = texto;
  return no;
}

function criarCardOperacao(op) {
  const cancelada = op.status === "CANCELADA";
  const card = criarElemento("article", "operacao" + (cancelada ? " cancelada" : ""));
  const cabecalho = criarElemento("div", "operacao-cabecalho");
  const nomeTipo = op.tipo === "COMPRA" ? "Compra" : "Venda";
  const titulo = criarElemento("h3", "", "#" + op.id + " · " + nomeTipo + " de " + op.ativo);
  titulo.id = "titulo-operacao-" + op.id;
  titulo.tabIndex = -1;
  card.setAttribute("aria-labelledby", titulo.id);
  const identificacao = criarElemento("div", "operacao-identificacao");
  identificacao.append(titulo, criarElemento("span", "status-operacao", cancelada ? "Cancelada" : "Ativa"));
  const horario = criarElemento("time", "operacao-data", dataHora.format(new Date(op.criado_em)));
  horario.dateTime = op.criado_em;
  cabecalho.append(identificacao, horario);
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

let buscaCarteira = 0;
async function atualizarCarteira(confirmacao = "") {
  const versao = ++buscaCarteira;
  id("atualizar-carteira").disabled = true;
  mensagem(id("mensagem-operacao"), "Carregando carteira…");
  try {
    const [historico, resumo] = await Promise.all([api("transacoes"), api("transacoes/resumo")]);
    if (versao !== buscaCarteira) return;
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
    if (versao === buscaCarteira) id("atualizar-carteira").disabled = false;
  }
}

async function alterarOperacao(numero, acao) {
  const excluir = acao === "excluir";
  if (excluir && !window.confirm("Excluir definitivamente a operação #" + numero + "?")) return;
  const botoes = id("titulo-operacao-" + numero).closest("article").querySelectorAll("button");
  botoes.forEach(botao => { botao.disabled = true; });
  try {
    if (excluir) await api("transacoes/" + numero, { metodo: "DELETE" });
    else await api("transacoes/" + numero + "/cancelar", { metodo: "PATCH" });
    await atualizarCarteira("Operação #" + numero + (excluir ? " excluída." : " cancelada."));
    const destino = id("titulo-operacao-" + numero) || id("titulo-historico");
    destino.focus({ preventScroll: true });
  } catch (erro) {
    mensagem(id("mensagem-operacao"), erro.message, "erro");
  } finally {
    botoes.forEach(botao => { botao.disabled = false; });
  }
}

id("formulario-conversao").addEventListener("submit", async evento => {
  evento.preventDefault();
  if (gravando || !cotacoes) return;
  gravando = true;
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
  }
});

id("montante").addEventListener("input", atualizarPrevia);
id("tipo").addEventListener("change", atualizarPrevia);
id("moeda-origem").addEventListener("change", atualizarPrevia);
id("atualizar-carteira").addEventListener("click", () => atualizarCarteira());
id("atualizar-cotacoes").addEventListener("click", buscarCotacoes);
id("sair").addEventListener("click", () => sair());
id("titulo-historico").tabIndex = -1;

// Só pedimos dados privados depois de o servidor validar a sessão. A consulta
// do histórico é independente da AwesomeAPI para funcionar durante falhas externas.
async function iniciar() {
  if (!tokenAtual()) return sair();
  try {
    const { usuario } = await api("auth/me");
    id("usuario").textContent = usuario.nome;
    id("conteudo").hidden = false;
    id("status-painel").hidden = true;
    await Promise.all([atualizarCarteira(), buscarCotacoes()]);
  } catch (erro) {
    id("status-painel").textContent = erro.message + " Recarregue a página para tentar novamente.";
  }
}

iniciar();
