// ==========================================================================
// TELA DE ACESSO (login.html): entrar ou criar conta
// O mesmo formulário tem dois modos. No modo "cadastro" aparecem os campos de nome
// e de confirmação da senha. Após o login, o token JWT recebido fica guardado na aba
// e o navegador abre o painel (index.html).
// ==========================================================================
import { api, iniciarSessao, tokenAtual } from "./api.js";

// Atalho para buscar um elemento da página pelo atributo id.
const id = nome => document.getElementById(nome);
// false = modo login; true = modo cadastro.
let cadastro = false;

/** Mostra uma mensagem abaixo dos campos. estado: "" (neutro), "erro" ou "sucesso". */
function mensagem(texto, estado = "") {
  id("mensagem-acesso").dataset.estado = estado;
  id("mensagem-acesso").textContent = texto;
}

/**
 * Desativar o formulário durante o envio faz o navegador tirar o foco do campo em uso.
 * Quando o foco ficou "solto" no corpo da página, ele volta para o elemento indicado,
 * e quem usa o teclado continua de onde parou.
 */
function devolverFoco(elemento) {
  const foco = document.activeElement;
  if ((!foco || foco === document.body) && elemento && elemento !== document.body && elemento.isConnected) {
    elemento.focus();
  }
}

/**
 * Alterna entre os modos login e cadastro, trocando textos e campos visíveis.
 * Campos ocultos ficam desativados para não bloquear a validação nativa no login.
 * @param {boolean} novoCadastro true para o modo cadastro.
 */
function mudarModo(novoCadastro) {
  cadastro = novoCadastro;
  id("titulo-acesso").textContent = cadastro ? "Criar minha conta" : "Acessar minha carteira";
  id("descricao-acesso").textContent = cadastro ? "Cadastre seu acesso à carteira de simulações." : "Entre para consultar suas simulações de câmbio.";
  id("entrar").textContent = cadastro ? "Cadastrar" : "Entrar";
  id("alternar-modo").textContent = cadastro ? "Fazer login" : "Criar conta";
  id("pergunta-modo").textContent = cadastro ? "Já tem conta?" : "Primeiro acesso?";
  for (const nome of ["nome", "confirmacao"]) {
    id("grupo-" + nome).hidden = !cadastro;
    id(nome).disabled = !cadastro;
    id(nome).required = cadastro;
  }
  // No cadastro a senha precisa de 8 caracteres; no login basta não estar vazia.
  id("senha").minLength = cadastro ? 8 : 1;
  // Ajuda os gerenciadores de senha a distinguir senha nova de senha existente.
  id("senha").autocomplete = cadastro ? "new-password" : "current-password";
  id("ajuda-senha").hidden = !cadastro;
  id("senha").value = "";
  id("confirmacao").value = "";
  id("confirmacao").setCustomValidity("");
  mensagem("");
  id(cadastro ? "nome" : "email").focus();
}

// EVENTOS -------------------------------------------------------------------
id("alternar-modo").addEventListener("click", () => mudarModo(!cadastro));
// Ao digitar, some a mensagem anterior e o aviso de confirmação diferente.
id("formulario-acesso").addEventListener("input", () => {
  id("confirmacao").setCustomValidity("");
  mensagem("");
});
// Envio do formulário: o navegador já conferiu os campos obrigatórios (required).
id("formulario-acesso").addEventListener("submit", async evento => {
  // Impede o recarregamento da página; o envio será feito pelo fetch.
  evento.preventDefault();
  if (cadastro && id("confirmacao").value !== id("senha").value) {
    id("confirmacao").setCustomValidity("A confirmação deve ser igual à senha.");
    id("confirmacao").reportValidity();
    return;
  }
  const dados = { email: id("email").value.trim(), senha: id("senha").value };
  // Guarda o elemento em foco antes de desativar o formulário (evita envios repetidos).
  const focoAnterior = document.activeElement;
  id("campos-acesso").disabled = true;
  id("alternar-modo").disabled = true;
  try {
    if (cadastro) {
      // Mensagem de carregamento enquanto o servidor responde.
      mensagem("Criando conta…");
      await api("auth/register", { privada: false, metodo: "POST", corpo: { ...dados, nome: id("nome").value.trim() } });
    } else {
      mensagem("Entrando…");
      const { token } = await api("auth/login", { privada: false, metodo: "POST", corpo: dados });
      iniciarSessao(token);
      // replace troca a página sem deixar o login no botão "Voltar" do navegador.
      location.replace("index.html");
      return;
    }
  } catch (erro) {
    // Ex.: "E-mail ou senha inválidos." ou "E-mail já cadastrado."
    mensagem(erro.message, "erro");
    return;
  } finally {
    // Sempre reativa o formulário, com sucesso ou com erro, e devolve o foco.
    id("campos-acesso").disabled = false;
    id("alternar-modo").disabled = false;
    devolverFoco(focoAnterior);
  }
  // O campo de e-mail só pode receber o foco depois que o formulário for reativado.
  mudarModo(false);
  mensagem("Conta criada. Entre com seu e-mail e senha.", "sucesso");
});

// INICIALIZAÇÃO ---------------------------------------------------------------
// Quem já tem token nesta aba vai direto ao painel. Quem voltou por sessão vencida vê o aviso.
if (tokenAtual()) {
  location.replace("index.html");
} else if (new URLSearchParams(location.search).get("sessao") === "expirada") {
  mensagem("Sua sessão expirou. Entre novamente.", "erro");
}
