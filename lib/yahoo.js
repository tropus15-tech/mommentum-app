// Schlanker Yahoo-Finance-Client (Chart-Endpoint, dividenden-/splitbereinigte Schlusskurse).
const cache = new Map();
const TTL_MS = 15 * 60 * 1000;

export async function fetchHistory(ticker, range = "3y") {
  const key = `${ticker}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Yahoo ${ticker}: HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(`Yahoo ${ticker}: keine Daten`);

  const adj = r.indicators?.adjclose?.[0]?.adjclose || r.indicators.quote[0].close;
  const raw = r.indicators.quote[0].close;
  const series = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (adj[i] == null || raw[i] == null) continue;
    series.push({
      date: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
      adj: adj[i],
      close: raw[i],
    });
  }
  const v = {
    ticker,
    currency: r.meta.currency,
    price: r.meta.regularMarketPrice ?? series.at(-1).close,
    priceTime: r.meta.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000).toISOString() : null,
    series,
  };
  cache.set(key, { t: Date.now(), v });
  return v;
}

export async function fetchMany(tickers, range = "3y", concurrency = 6) {
  const out = {};
  const errors = {};
  let i = 0;
  async function worker() {
    while (i < tickers.length) {
      const t = tickers[i++];
      try {
        out[t] = await fetchHistory(t, range);
      } catch (e) {
        errors[t] = e.message;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { data: out, errors };
}
