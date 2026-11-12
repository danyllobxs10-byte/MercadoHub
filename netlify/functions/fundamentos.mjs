// Indicadores fundamentalistas (Fundamentus, página de detalhes do papel).
// GET /api/fundamentos?t=ITUB4
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  acirc: "â", ecirc: "ê", ocirc: "ô", atilde: "ã", otilde: "õ", ccedil: "ç", agrave: "à", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó",
  Uacute: "Ú", Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô" };
function decode(s) {
  return s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENT ? ENT[n] : m));
}
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

// Lê os pares rótulo/valor das tabelas (células class="label" seguidas de class="data").
export function parseFundamentus(html) {
  const cells = [];
  const re = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(html))) {
    const cls = ((m[1].match(/class\s*=\s*"([^"]*)"/i) || [])[1] || "").toLowerCase();
    const inner = m[2].replace(/<span[^>]*class\s*=\s*"[^"]*help[^"]*"[^>]*>[\s\S]*?<\/span>/gi, "");
    const text = decode(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().replace(/^\?\s*/, "");
    cells.push({ label: /\blabel\b/.test(cls), data: /\bdata\b/.test(cls), text });
  }
  const raw = {};
  for (let i = 0; i < cells.length - 1; i++) {
    if (cells[i].label && cells[i + 1].data && cells[i].text) {
      const k = norm(cells[i].text);
      if (k && !(k in raw)) raw[k] = { label: cells[i].text, value: cells[i + 1].text };
    }
  }
  return raw;
}

export function num(s) {
  if (s == null) return null;
  s = String(s).replace(/%/g, "").replace(/\s/g, "").trim();
  if (!s || s === "-" || s === "--") return null;
  s = s.replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return isFinite(v) ? v : null;
}

const FIELDS = {
  empresa: ["Empresa"], tipo: ["Tipo"], setor: ["Setor"], subsetor: ["Subsetor"], dataCot: ["Data últ cot"],
  ultBalanco: ["Últ balanço processado"],
};
const NUMS = {
  cotacao: ["Cotação"], valorMercado: ["Valor de mercado"], valorFirma: ["Valor da firma"], nAcoes: ["Nro. Ações"],
  pl: ["P/L"], pvp: ["P/VP"], lpa: ["LPA"], vpa: ["VPA"], dy: ["Div. Yield"], roe: ["ROE"], roic: ["ROIC"],
  margemLiq: ["Marg. Líquida"], margemEbit: ["Marg. EBIT"], evEbitda: ["EV / EBITDA"], evEbit: ["EV / EBIT"],
  divBrPatrim: ["Div Br/ Patrim"], liqCorr: ["Liquidez Corr"], min52: ["Min 52 sem"], max52: ["Max 52 sem"],
  volMed2m: ["Vol $ méd (2m)"], patrimLiq: ["Patrim. Líq"], lucroLiq: ["Lucro Líquido"], receitaLiq: ["Receita Líquida"],
  cresc5a: ["Cres. Rec (5a)"], osc12m: ["12 meses"], oscMes: ["Mês"], oscDia: ["Dia"],
};

export function normalize(raw) {
  const get = (labels) => { for (const l of labels) { const r = raw[norm(l)]; if (r) return r.value; } return null; };
  const out = {};
  for (const [k, labels] of Object.entries(FIELDS)) out[k] = get(labels);
  for (const [k, labels] of Object.entries(NUMS)) out[k] = num(get(labels));
  // Percentuais vêm como 6,49% -> 6.49 (mantidos em pontos percentuais)
  return out;
}

function reply(status, body, cacheSeconds) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  if (cacheSeconds) {
    headers["Cache-Control"] = "public, max-age=300";
    headers["CDN-Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default async (req) => {
  const url = new URL(req.url);
  const t = String(url.searchParams.get("t") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,7}$/.test(t)) return reply(400, { error: "Ticker inválido" });
  try {
    const res = await fetch(`https://www.fundamentus.com.br/detalhes.php?papel=${t}`, {
      headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder("iso-8859-1").decode(buf);
    const raw = parseFundamentus(html);
    if (!raw[norm("Papel")] && !raw[norm("Cotação")]) return reply(404, { error: "Papel sem dados no Fundamentus", ticker: t });
    return reply(200, { ticker: t, fonte: "Fundamentus", ...normalize(raw) }, 21600);
  } catch (e) {
    return reply(502, { error: String(e && e.message || e), ticker: t });
  }
};

export const config = { path: "/api/fundamentos" };
