// Ranking de um pregão: maiores altas e baixas entre as ações do Ibovespa (e extras).
// GET /api/ranking?d=2026-11-12&extra=ITUB4,CURY3   (sem d = último pregão)
import { yahooSymbol, parseChart } from "./cotacao.mjs";

// Carteira teórica do Ibovespa, set–dez/2026 (76 ações). Atualizar a cada rebalanceamento (jan, mai, set).
export const IBOV = ["VALE3","ITUB4","PETR4","AXIA3","PETR3","SBSP3","BBDC4","B3SA3","ITSA4","WEGE3","EMBJ3","BPAC11","ABEV3",
  "BBAS3","ENEV3","PRIO3","EQTL3","CPLE3","VBBR3","RDOR3","UGPA3","RENT3","GGBR4","SUZB3","RADL3","BBSE3","BBDC3","CSMG3",
  "RAIL3","VIVT3","CMIG4","TOTS3","ENGI11","MOTV3","KLBN11","TIMS3","MBRF3","EGIE3","ALOS3","ISAE4","CXSE3","ASAI3","SANB11",
  "LREN3","SMFT3","CMIN3","MULT3","GOAU4","PSSA3","CSAN3","TAEE11","FLRY3","CPFE3","NATU3","HYPE3","CYRE3","BRAP4","IGTI11",
  "CURY3","BRAV3","COGN3","TEND3","CSNA3","USIM5","DIRR3","AURE3","POMO4","VIVA3","YDUQ3","MRVE3","AZZA3","MGLU3","HAPV3",
  "BEEF3","CEAB3","VAMO3"];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

export const ymd = (ts) => new Date((ts - 3 * 3600) * 1000).toISOString().slice(0, 10);
const todaySP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

// Último pregão com data <= d, comparado ao fechamento anterior.
export function pickSession(series, d) {
  let idx = -1;
  for (let i = 0; i < series.length; i++) if (ymd(series[i].t) <= d) idx = i;
  if (idx < 1) return null;
  const b = series[idx], pv = series[idx - 1].c;
  return { d: ymd(b.t), c: b.c, pv, chg: (b.c / pv - 1) * 100, v: b.v, fin: b.v != null ? b.v * b.c : null };
}

async function chart(sym, p1, p2) {
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false`;
  let err = "falha";
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const json = await res.json().catch(() => null);
      if (!json) { err = `HTTP ${res.status}`; continue; }
      return parseChart(json);
    } catch (e) { err = String(e && e.message || e); }
  }
  return { error: err };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export function buildRanking(results, d) {
  const count = {};
  for (const r of results) if (r.s) count[r.s.d] = (count[r.s.d] || 0) + 1;
  const data = Object.keys(count).sort((a, b) => count[b] - count[a] || (a < b ? 1 : -1))[0] || null;
  const rows = [], falhas = [];
  for (const r of results) {
    if (r.t === "^BVSP") continue;
    if (!r.s || r.s.d !== data) { falhas.push(r.t); continue; }
    rows.push({ t: r.t, nome: r.nome, ibov: r.ibov, c: r.s.c, pv: r.s.pv, chg: r.s.chg, v: r.s.v, fin: r.s.fin });
  }
  const b = results.find((r) => r.t === "^BVSP");
  const ibov = b && b.s && b.s.d === data ? { c: b.s.c, chg: b.s.chg } : null;
  return { data, solicitada: d, ibov, rows, falhas };
}

function reply(status, body, cacheSeconds) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  if (cacheSeconds) {
    headers["Cache-Control"] = "public, max-age=120";
    headers["CDN-Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default async (req) => {
  const url = new URL(req.url);
  const hoje = todaySP();
  let d = String(url.searchParams.get("d") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > hoje) d = hoje;
  const extra = String(url.searchParams.get("extra") || "").toUpperCase().split(",").map((s) => s.trim())
    .filter((s) => /^[A-Z0-9]{4,7}$/.test(s)).slice(0, 40);
  const set = new Set(IBOV);
  const list = [...IBOV.map((t) => ({ t, ibov: true })), ...[...new Set(extra)].filter((t) => !set.has(t)).map((t) => ({ t, ibov: false })), { t: "^BVSP", ibov: false }];
  const base = Date.parse(d + "T12:00:00Z") / 1000;
  const p1 = base - 20 * 86400, p2 = base + 86400;
  const results = await pool(list, 12, async (it) => {
    const q = await chart(yahooSymbol(it.t), p1, p2);
    if (q.error) return { ...it, s: null };
    return { ...it, nome: q.name, s: pickSession(q.series, d) };
  });
  const out = buildRanking(results, d);
  if (!out.data) return reply(502, { error: "Não foi possível obter os pregões dessa data", solicitada: d });
  return reply(200, out, out.data < hoje ? 86400 : 300);
};

export const config = { path: "/api/ranking" };
