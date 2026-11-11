import yahooFinance from "yahoo-finance2";
import { scoreLevermann } from "../../lib/levermann";

const MAX_SYMBOLS = 15;
const LARGE_CAP_MIN = 5e9; // Näherung: Levermann definiert Large Caps über Indexzugehörigkeit
const YF = { validateResult: false };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pct = (a, b) => (isNum(a) && isNum(b) && b !== 0 ? (a / b - 1) * 100 : null);

// Vergleichsindex nach Börsenkürzel des Tickers.
const BENCHMARKS = {
  DE: "^GDAXI", F: "^GDAXI", PA: "^FCHI", L: "^FTSE", AS: "^AEX", SW: "^SSMI",
  MI: "FTSEMIB.MI", MC: "^IBEX", VI: "^ATX", ST: "^OMX", T: "^N225", TO: "^GSPTSE",
};
function benchmarkFor(symbol) {
  const i = symbol.lastIndexOf(".");
  if (i < 0) return "^GSPC";
  return BENCHMARKS[symbol.slice(i + 1).toUpperCase()] || "^STOXX50E";
}

async function dailyCloses(symbol) {
  const period1 = new Date();
  period1.setMonth(period1.getMonth() - 14);
  const r = await yahooFinance.chart(symbol, { period1, interval: "1d" }, YF);
  return (r.quotes || [])
    .filter((q) => isNum(q.close))
    .map((q) => ({ date: new Date(q.date), close: q.close }));
}

// Letzter Schlusskurs am oder vor dem Datum.
function closeAt(series, date) {
  let hit = null;
  for (const q of series) {
    if (q.date <= date) hit = q;
    else break;
  }
  return hit ? hit.close : null;
}

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

// Renditen der letzten 3 abgeschlossenen Kalendermonate (älteste zuerst).
function lastThreeMonthReturns(series) {
  const ends = new Map(); // "YYYY-M" -> letzter Schlusskurs des Monats
  for (const q of series) ends.set(`${q.date.getFullYear()}-${q.date.getMonth()}`, q.close);
  const now = new Date();
  const out = [];
  for (let k = 3; k >= 1; k--) {
    const end = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const start = new Date(now.getFullYear(), now.getMonth() - k - 1, 1);
    const a = ends.get(`${start.getFullYear()}-${start.getMonth()}`);
    const b = ends.get(`${end.getFullYear()}-${end.getMonth()}`);
    const r = pct(b, a);
    if (r === null) return null;
    out.push(r);
  }
  return out;
}

// Tagesrendite am ersten Handelstag ab dem Datum (Schluss vs. Vortagesschluss).
function dayReturn(series, date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const i = series.findIndex((q) => q.date >= day);
  if (i < 1) return null;
  return pct(series[i].close, series[i - 1].close);
}

// fundamentalsTimeSeries liefert je nach Version unterschiedliche Schreibweisen.
function field(row, name) {
  if (!row) return null;
  const variants = [name, name[0].toLowerCase() + name.slice(1), name[0].toUpperCase() + name.slice(1)];
  for (const k of variants) if (isNum(row[k])) return row[k];
  return null;
}

async function analyze(symbol, indexCache, capOverride) {
  const warnings = [];
  const soft = async (label, fn) => {
    try {
      return await fn();
    } catch (e) {
      warnings.push(`${label} nicht verfügbar`);
      return null;
    }
  };

  const quote = await yahooFinance.quote(symbol, {}, YF);
  if (!quote) throw new Error("Ticker nicht gefunden");

  const benchmark = benchmarkFor(symbol);
  if (!indexCache.has(benchmark)) {
    indexCache.set(benchmark, dailyCloses(benchmark).catch(() => null));
  }

  const fyStart = new Date();
  fyStart.setFullYear(fyStart.getFullYear() - 5);

  const [summary, annual, prices, indexPrices] = await Promise.all([
    soft("Schätzungen/Analysten", () =>
      yahooFinance.quoteSummary(
        symbol,
        { modules: ["earningsTrend", "recommendationTrend", "assetProfile", "financialData"] },
        YF
      )
    ),
    soft("Jahresabschlüsse", () =>
      yahooFinance.fundamentalsTimeSeries(symbol, { period1: fyStart, type: "annual", module: "all" }, YF)
    ),
    soft("Kurshistorie", () => dailyCloses(symbol)),
    indexCache.get(benchmark),
  ]);
  if (!indexPrices) warnings.push(`Index ${benchmark} nicht verfügbar`);

  const price = quote.regularMarketPrice ?? null;
  const sector = summary?.assetProfile?.sector || null;
  const isFinancial = sector === "Financial Services";
  const isLargeCap =
    capOverride === "large" ? true : capOverride === "small" ? false : (quote.marketCap || 0) >= LARGE_CAP_MIN;

  // --- Fundamentaldaten letztes Geschäftsjahr ---
  const years = (annual || [])
    .filter((r) => field(r, "TotalRevenue") !== null || field(r, "NetIncome") !== null)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const fy = years[years.length - 1];
  const netIncome = field(fy, "NetIncome");
  const equity = field(fy, "StockholdersEquity");
  const assets = field(fy, "TotalAssets");
  const revenue = field(fy, "TotalRevenue");
  const ebit = field(fy, "EBIT");

  let roe = isNum(netIncome) && isNum(equity) && equity > 0 ? (netIncome / equity) * 100 : null;
  let ebitMargin = isNum(ebit) && isNum(revenue) && revenue > 0 ? (ebit / revenue) * 100 : null;
  const equityRatio = isNum(equity) && isNum(assets) && assets > 0 ? (equity / assets) * 100 : null;

  // Rückfall auf TTM-Werte, falls kein Jahresabschluss vorliegt.
  const fd = summary?.financialData;
  if (roe === null && isNum(fd?.returnOnEquity)) {
    roe = fd.returnOnEquity * 100;
    warnings.push("RoE: TTM statt letztes Geschäftsjahr");
  }
  if (ebitMargin === null && !isFinancial && isNum(fd?.operatingMargins)) {
    ebitMargin = fd.operatingMargins * 100;
    warnings.push("EBIT-Marge: TTM statt letztes Geschäftsjahr");
  }

  // --- Gewinnschätzungen ---
  const trend = summary?.earningsTrend?.trend || [];
  const cur = trend.find((t) => t.period === "0y");
  const next = trend.find((t) => t.period === "+1y");
  const epsCurrent = cur?.earningsEstimate?.avg ?? null;
  const epsNext = next?.earningsEstimate?.avg ?? null;

  // Yahoo liefert EPS in Bilanzwährung; bei abweichender Kurswährung wären KGVs falsch.
  const fxMismatch =
    quote.financialCurrency && quote.currency && quote.financialCurrency !== quote.currency;
  if (fxMismatch) {
    warnings.push(`KGV nicht berechnet: Kurs in ${quote.currency}, Gewinne in ${quote.financialCurrency}`);
  }

  const pastEps = years.map((r) => field(r, "DilutedEPS")).filter(isNum).slice(-3);
  let peCurrent = null;
  let pe5 = null;
  let eps5 = null;
  if (!fxMismatch && isNum(price)) {
    if (isNum(epsCurrent) && epsCurrent > 0) peCurrent = price / epsCurrent;
    if (pastEps.length === 3 && isNum(epsCurrent) && isNum(epsNext)) {
      eps5 = (pastEps.reduce((a, b) => a + b, 0) + epsCurrent + epsNext) / 5;
      if (eps5 > 0) pe5 = price / eps5;
    }
  }

  const epsGrowth =
    isNum(epsCurrent) && isNum(epsNext) && epsCurrent > 0 ? (epsNext / epsCurrent - 1) * 100 : null;

  const epsNow = cur?.epsTrend?.current;
  const eps30 = cur?.epsTrend?.["30daysAgo"];
  const epsRevision = isNum(epsNow) && isNum(eps30) && eps30 > 0 ? (epsNow / eps30 - 1) * 100 : null;

  // --- Analysten ---
  const rec = (summary?.recommendationTrend?.trend || []).find((t) => t.period === "0m");
  const analysts = rec
    ? {
        buy: (rec.strongBuy || 0) + (rec.buy || 0),
        hold: rec.hold || 0,
        sell: (rec.sell || 0) + (rec.strongSell || 0),
      }
    : null;

  // --- Kurskriterien ---
  let perf6m = null;
  let perf12m = null;
  let reversal = null;
  let earningsReaction = null;
  let earningsDate = null;
  if (prices && prices.length) {
    const last = prices[prices.length - 1].close;
    perf6m = pct(last, closeAt(prices, monthsAgo(6)));
    perf12m = pct(last, closeAt(prices, monthsAgo(12)));

    if (indexPrices) {
      const s = lastThreeMonthReturns(prices);
      const i = lastThreeMonthReturns(indexPrices);
      if (s && i) reversal = s.map((v, k) => ({ stock: v, index: i[k] }));

      // Yahoo nennt nur einen Termin; liegt er in der Zukunft, fehlt der letzte Berichtstag.
      const ts = quote.earningsTimestamp ? new Date(quote.earningsTimestamp) : null;
      if (ts && ts < new Date() && ts > monthsAgo(4)) {
        const rs = dayReturn(prices, ts);
        const ri = dayReturn(indexPrices, ts);
        if (rs !== null && ri !== null) {
          earningsReaction = rs - ri;
          earningsDate = ts.toISOString().slice(0, 10);
        }
      }
    }
  }
  if (earningsReaction === null) warnings.push("Letzter Quartalszahlen-Termin unbekannt (Kriterium 7 = 0)");

  const result = scoreLevermann({
    roe, ebitMargin, equityRatio, pe5, eps5, peCurrent, epsCurrent,
    analysts, earningsReaction, epsRevision, perf6m, perf12m, reversal,
    epsGrowth, isLargeCap, isFinancial,
  });

  return {
    symbol,
    name: quote.shortName || quote.longName || symbol,
    price,
    currency: quote.currency || null,
    marketCap: quote.marketCap || null,
    sector,
    isLargeCap,
    isFinancial,
    benchmark,
    fiscalYear: fy ? new Date(fy.date).toISOString().slice(0, 10) : null,
    earningsDate,
    warnings,
    ...result,
  };
}

export default async function handler(req, res) {
  const symbols = String(req.query.symbols || "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z0-9.\-^=]{1,15}$/.test(s));
  const unique = [...new Set(symbols)].slice(0, MAX_SYMBOLS);
  if (!unique.length) {
    res.status(400).json({ error: "Parameter symbols fehlt (z. B. SAP.DE,ALV.DE)" });
    return;
  }
  const cap = ["large", "small"].includes(req.query.cap) ? req.query.cap : "auto";

  const indexCache = new Map();
  const results = [];
  // Nacheinander abrufen, um Yahoo-Ratenlimits (HTTP 429) zu schonen.
  for (const symbol of unique) {
    try {
      results.push(await analyze(symbol, indexCache, cap));
    } catch (e) {
      const limited = /Too Many Requests|429/.test(e?.message || "");
      results.push({
        symbol,
        error: limited ? "Yahoo-Ratenlimit erreicht, später erneut versuchen" : "Keine Daten gefunden",
      });
    }
  }

  results.sort((a, b) => (b.total ?? -99) - (a.total ?? -99));
  res.status(200).json({ asOf: new Date().toISOString(), results });
}
