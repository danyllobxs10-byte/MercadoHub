// Cotações e histórico (Yahoo Finance, endpoint de gráfico, sem autenticação).
// GET /api/cotacao?t=ITUB4&range=1mo|6mo|1y|2y|5y
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const INTERVAL = { "5d": "1d", "1mo": "1d", "3mo": "1d", "6mo": "1d", "1y": "1d", "2y": "1d", "5y": "1wk" };
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

export function yahooSymbol(t) {
  t = String(t || "").trim().toUpperCase();
  if (!/^[A-Z0-9^=.\-]{1,15}$/.test(t)) return null;
  if (t.startsWith("^") || t.includes("=") || t.includes("-") || t.includes(".")) return t;
  return t + ".SA"; // ações, FIIs, ETFs e BDRs da B3
}

export function parseChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r) return { error: (json && json.chart && json.chart.error && json.chart.error.description) || "Ativo não encontrado" };
  const m = r.meta || {};
  const ts = r.timestamp || [];
  const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close && q.close[i];
    if (c == null || isNaN(c)) continue;
    series.push({ t: ts[i], o: q.open?.[i] ?? null, h: q.high?.[i] ?? null, l: q.low?.[i] ?? null, c, v: q.volume?.[i] ?? null });
  }
  if (!series.length && m.regularMarketPrice == null) return { error: "Sem dados para o ativo" };
  return {
    symbol: m.symbol,
    name: m.longName || m.shortName || m.symbol,
    currency: m.currency || "BRL",
    price: m.regularMarketPrice ?? (series.length ? series[series.length - 1].c : null),
    time: m.regularMarketTime ?? null,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    high52: m.fiftyTwoWeekHigh ?? null,
    low52: m.fiftyTwoWeekLow ?? null,
    series,
  };
}

function reply(status, body, cacheSeconds) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" };
  if (cacheSeconds) {
    headers["Cache-Control"] = "public, max-age=60";
    headers["Netlify-CDN-Cache-Control"] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default async (req) => {
  const url = new URL(req.url);
  const sym = yahooSymbol(url.searchParams.get("t"));
  if (!sym) return reply(400, { error: "Ticker inválido" });
  let range = url.searchParams.get("range") || "1mo";
  if (!INTERVAL[range]) range = "1mo";
  let interval = INTERVAL[range];
  if (url.searchParams.get("i") === "1d") interval = "1d";
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplit`;
  let lastErr = "Fonte indisponível";
  for (const host of HOSTS) {
    try {
      const res = await fetch(host + path, { headers: { "User-Agent": UA, Accept: "application/json" } });
      const json = await res.json().catch(() => null);
      if (!json) { lastErr = `Resposta inválida (${res.status})`; continue; }
      const data = parseChart(json);
      if (data.error) return reply(404, { error: data.error, symbol: sym });
      return reply(200, { ...data, range, interval }, range === "5y" || range === "2y" ? 3600 : 300);
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
  }
  return reply(502, { error: lastErr, symbol: sym });
};

export const config = { path: "/api/cotacao" };
