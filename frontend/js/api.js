// ==========================================================================
// COMUNICAÇÃO COM A API (Fetch) E SESSÃO
// Todas as páginas falam com o back-end por meio da função api() deste arquivo.
// Ela monta a URL, envia JSON, anexa o token JWT e transforma respostas de erro
// em mensagens legíveis para a tela.
// ==========================================================================

// Na execução com dois servidores a porta muda. Quando o Express também
// entrega a página, cliente e API compartilham a mesma origem.
// Ex.: página em http://localhost:5173 → API em http://localhost:3000/api/
const origem = new URL(location.origin);
if (origem.port === "5173") origem.port = "3000";
const base = new URL("/api/", origem);
// Nome da "gaveta" do sessionStorage onde o token fica guardado.
// O sessionStorage é apagado quando a aba é fechada.
const chaveSessao = "cambiotrack.jwt";

/** @returns {string|null} Token guardado nesta aba, ou null se não houver login. */
export const tokenAtual = () => sessionStorage.getItem(chaveSessao);

/** Guarda o token recebido no login. @param {string} token */
export const iniciarSessao = token => sessionStorage.setItem(chaveSessao, token);

/**
 * Encerra a sessão: apaga o token desta aba e abre a tela de login.
 * @param {boolean} expirou true para mostrar o aviso "Sua sessão expirou".
 */
export function sair(expirou = false) {
  sessionStorage.removeItem(chaveSessao);
  location.replace(expirou ? "login.html?sessao=expirada" : "login.html");
}

/**
 * Faz uma chamada à API e devolve o JSON da resposta.
 * Apenas esta função lê o token para as chamadas. Uma resposta 401 de uma
 * rota privada termina a sessão, enquanto erros de login aparecem no formulário.
 * @param {string} rota Caminho depois de /api/, por exemplo "transacoes".
 * @param {object} opcoes
 * @param {string} opcoes.metodo Método HTTP: GET (ler), POST (criar), PATCH (alterar) ou DELETE (apagar).
 * @param {object} opcoes.corpo Dados enviados como JSON (opcional).
 * @param {boolean} opcoes.privada true quando a rota exige o cabeçalho Authorization.
 * @returns {Promise<any>} Dados da resposta (null quando o servidor responde 204, sem conteúdo).
 * @throws {Error} Com uma mensagem pronta para mostrar ao usuário e o status HTTP em erro.status.
 */
export async function api(rota, { metodo = "GET", corpo, privada = true } = {}) {
  const headers = { Accept: "application/json" };
  if (privada) {
    const token = tokenAtual();
    // Sem token não adianta chamar uma rota privada: volta direto para o login.
    if (!token) {
      sair();
      throw new Error("Entre para acessar a carteira.");
    }
    // É este cabeçalho que prova ao servidor quem está pedindo os dados.
    headers.Authorization = "Bearer " + token;
  }
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  let resposta;
  try {
    // AbortSignal.timeout desiste da chamada após 20 segundos.
    // cache "no-store" evita que o navegador reaproveite respostas antigas.
    resposta = await fetch(new URL(rota, base), {
      method: metodo, headers, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20000), cache: "no-store"
    });
  } catch (erro) {
    // O fetch cai aqui quando não há resposta que a página possa ler: servidor desligado,
    // rede fora, demora ou bloqueio do próprio navegador (origem recusada pelo CORS ou
    // endereço fora da Content-Security-Policy).
    if (erro.name === "TimeoutError") throw new Error("O servidor demorou para responder. Consulte a carteira antes de repetir uma operação.");
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
  }
  // 401 em rota privada: token ausente, alterado ou vencido. Volta ao login com aviso.
  if (resposta.status === 401 && privada) {
    sair(true);
    throw new Error("Sua sessão expirou.");
  }
  // 204 significa sucesso sem corpo (usado na exclusão).
  if (resposta.status === 204) return null;
  let dados;
  try {
    dados = await resposta.json();
  } catch {
    throw new Error("O servidor enviou uma resposta inesperada.");
  }
  // Códigos 4xx e 5xx: o back-end sempre explica o motivo no campo "erro".
  if (!resposta.ok) {
    const erro = new Error(dados.erro || "Não foi possível concluir a solicitação.");
    erro.status = resposta.status;
    throw erro;
  }
  return dados;
}
