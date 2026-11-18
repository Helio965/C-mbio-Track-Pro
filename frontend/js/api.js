// Na execução com dois servidores a porta muda. Quando o Express também
// entrega a página, cliente e API compartilham a mesma origem.
const origem = new URL(location.origin);
if (origem.port === "5173") origem.port = "3000";
const base = new URL("/api/", origem);
const chaveSessao = "cambiotrack.jwt";

export const tokenAtual = () => sessionStorage.getItem(chaveSessao);
export const iniciarSessao = token => sessionStorage.setItem(chaveSessao, token);
export function sair(expirou = false) {
  sessionStorage.removeItem(chaveSessao);
  location.replace(expirou ? "login.html?sessao=expirada" : "login.html");
}

// Apenas esta função lê o token para as chamadas. Uma resposta 401 de uma
// rota privada termina a sessão, enquanto erros de login aparecem no formulário.
export async function api(rota, { metodo = "GET", corpo, privada = true } = {}) {
  const headers = { Accept: "application/json" };
  if (privada) {
    const token = tokenAtual();
    if (!token) {
      sair();
      throw new Error("Entre para acessar a carteira.");
    }
    headers.Authorization = "Bearer " + token;
  }
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  let resposta;
  try {
    resposta = await fetch(new URL(rota, base), {
      method: metodo, headers, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000), cache: "no-store"
    });
  } catch (erro) {
    if (erro.name === "TimeoutError") throw new Error("O servidor demorou para responder. Consulte a carteira antes de repetir uma operação.");
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
  }
  if (resposta.status === 401 && privada) {
    sair(true);
    throw new Error("Sua sessão expirou.");
  }
  if (resposta.status === 204) return null;
  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new Error("O servidor enviou uma resposta inesperada.");
  }
  if (!resposta.ok) {
    const erro = new Error(dados.erro || "Não foi possível concluir a solicitação.");
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}
