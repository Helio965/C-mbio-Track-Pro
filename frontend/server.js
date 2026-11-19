// ==========================================================================
// SERVIDOR DO FRONT-END (porta 5173)
// Entrega ao navegador os arquivos HTML, CSS e JavaScript da interface.
// Não usa bibliotecas: apenas o módulo http que já vem com o Node.js.
// O cliente usa apenas arquivos estáticos. Uma lista explícita limita os arquivos
// públicos, inclusive quando chegam caminhos inesperados na URL.
// ==========================================================================
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

// Endereço pedido pelo navegador → arquivo correspondente nesta pasta.
const paginas = new Map([
  ["/", "index.html"], ["/index.html", "index.html"], ["/login.html", "login.html"],
  ["/css/style.css", "css/style.css"], ["/js/api.js", "js/api.js"],
  ["/js/script.js", "js/script.js"], ["/js/login.js", "js/login.js"]
]);
// Tipo de conteúdo informado ao navegador para cada extensão de arquivo.
const tipos = { html: "text/html", js: "text/javascript", css: "text/css" };

createServer(async (req, res) => {
  try {
    // Cabeçalhos de segurança: o navegador não "adivinha" tipos e não envia a página de origem.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // Este servidor só lê arquivos: qualquer método além de GET e HEAD recebe 405.
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    // Ignora o que vem depois de "?" (ex.: login.html?sessao=expirada).
    const arquivo = paginas.get(req.url.split("?")[0]);
    if (!arquivo) {
      res.writeHead(404).end();
      return;
    }
    const conteudo = await readFile(new URL(arquivo, import.meta.url));
    res.setHeader("Cache-Control", "no-store");
    // Content-Security-Policy: a página só carrega scripts e estilos deste servidor e só
    // pode chamar a própria origem e a API na porta 3000.
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://localhost:3000 http://127.0.0.1:3000; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.writeHead(200, { "Content-Type": tipos[arquivo.split(".").at(-1)] + "; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : conteudo);
  } catch {
    res.writeHead(500).end();
  }
}).listen(5173, "0.0.0.0", () => console.log("Front-end disponível na porta 5173: abra http://localhost:5173"));
