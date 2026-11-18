import { api, iniciarSessao, tokenAtual } from "./api.js";

const id = nome => document.getElementById(nome);
let cadastro = false;

function mensagem(texto, estado = "") {
  id("mensagem-acesso").dataset.estado = estado;
  id("mensagem-acesso").textContent = texto;
}

// Campos ocultos ficam desativados para não bloquear a validação nativa no login.
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
  id("senha").minLength = cadastro ? 8 : 1;
  id("senha").autocomplete = cadastro ? "new-password" : "current-password";
  id("ajuda-senha").hidden = !cadastro;
  id("senha").value = "";
  id("confirmacao").value = "";
  id("confirmacao").setCustomValidity("");
  mensagem("");
  id(cadastro ? "nome" : "email").focus();
}

id("alternar-modo").addEventListener("click", () => mudarModo(!cadastro));
id("formulario-acesso").addEventListener("input", () => {
  id("confirmacao").setCustomValidity("");
  mensagem("");
});
id("formulario-acesso").addEventListener("submit", async evento => {
  evento.preventDefault();
  if (cadastro && id("confirmacao").value !== id("senha").value) {
    id("confirmacao").setCustomValidity("A confirmação deve ser igual à senha.");
    id("confirmacao").reportValidity();
    return;
  }
  const dados = { email: id("email").value.trim(), senha: id("senha").value };
  id("campos-acesso").disabled = true;
  id("alternar-modo").disabled = true;
  try {
    if (cadastro) {
      mensagem("Criando conta…");
      await api("auth/register", { privada: false, metodo: "POST", corpo: { ...dados, nome: id("nome").value.trim() } });
      mudarModo(false);
      mensagem("Conta criada. Entre com seu e-mail e senha.", "sucesso");
    } else {
      mensagem("Entrando…");
      const { token } = await api("auth/login", { privada: false, metodo: "POST", corpo: dados });
      iniciarSessao(token);
      location.replace("index.html");
    }
  } catch (erro) {
    mensagem(erro.message, "erro");
  } finally {
    id("campos-acesso").disabled = false;
    id("alternar-modo").disabled = false;
  }
});

if (tokenAtual()) {
  location.replace("index.html");
} else if (new URLSearchParams(location.search).get("sessao") === "expirada") {
  mensagem("Sua sessão expirou. Entre novamente.", "erro");
}
