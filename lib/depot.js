import portfolio from "../data/portfolio.json";
import { UNIVERSE } from "../data/universe";
import { fetchMany } from "./yahoo";
import * as A from "./analytics";

export const WEIGHTS = { diversification: 0.4, trend: 0.3, entry: 0.2, cost: 0.1 };
const ADD_SHARE = 0.1; // Simulation: Kandidat bekommt 10 % des Depots

export async function buildDepot() {
  const heldTickers = portfolio.holdings.map((h) => h.ticker);
  const candidates = UNIVERSE.filter((u) => !heldTickers.includes(u.ticker));
  const { data, errors } = await fetchMany([...heldTickers, ...candidates.map((c) => c.ticker)]);

  const missing = heldTickers.filter((t) => !data[t]);
  if (missing.length) throw new Error(`Keine Kursdaten für Depotposition(en): ${missing.join(", ")}`);

  // ---- Positionen ----
  const pos = portfolio.holdings.map((h) => {
    const d = data[h.ticker];
    const value = h.shares * d.price;
    return { ...h, price: d.price, priceTime: d.priceTime, value, gain: value - h.purchaseValue, gainPct: value / h.purchaseValue - 1, tech: A.technicals(d.series), wk: A.weeklyReturns(d.series) };
  });
  const total = pos.reduce((s, p) => s + p.value, 0);
  const cost = pos.reduce((s, p) => s + p.purchaseValue, 0);
  pos.forEach((p) => (p.weight = p.value / total));

  // ---- Depot-Renditereihe (aktuelle Gewichte, wöchentlich rebalanciert, rückgerechnet) ----
  const aligned = A.align(pos.map((p) => p.wk));
  const n = aligned[0].length;
  const pfRet = Array.from({ length: n }, (_, i) => pos.reduce((s, p, j) => s + p.weight * aligned[j][i], 0));
  const pfVar = A.cov(pfRet, pfRet);
  const pfVol = A.annVol(pfRet);
  let lvl = 1;
  const pfCurve = pfRet.map((r) => (lvl *= 1 + r));

  pos.forEach((p, j) => {
    p.vol = A.annVol(aligned[j]);
    p.riskShare = (p.weight * A.cov(aligned[j], pfRet)) / pfVar;
    const rest = pfRet.map((r, i) => r - p.weight * aligned[j][i]);
    p.corrRest = A.corr(aligned[j], rest);
    p.signal = holdingSignal(p);
  });

  const corrMatrix = pos.map((_, i) => pos.map((_, j) => A.corr(aligned[i], aligned[j])));
  const weightedVol = pos.reduce((s, p) => s + p.weight * p.vol, 0);

  // Map Woche -> Depotrendite für Kandidaten-Abgleich
  const weekKeys = [...pos[0].wk.keys()].filter((k) => pos.every((p) => p.wk.has(k))).sort((a, b) => a - b);
  const pfMap = new Map(weekKeys.map((k, i) => [k, pfRet[i]]));

  // ---- Kandidaten ----
  let cands = candidates
    .filter((c) => data[c.ticker])
    .map((c) => {
      const d = data[c.ticker];
      const [cr, pr] = A.align([A.weeklyReturns(d.series), pfMap]);
      const tech = A.technicals(d.series);
      const mixed = pr.map((r, i) => (1 - ADD_SHARE) * r + ADD_SHARE * cr[i]);
      return {
        ...c,
        price: d.price,
        weeks: cr.length,
        corr: A.corr(cr, pr),
        beta: A.cov(cr, pr) / A.cov(pr, pr),
        vol: A.annVol(cr),
        dVol: A.annVol(mixed) - A.annVol(pr),
        tech,
        signal: A.entrySignal(tech),
      };
    });

  const momRank = A.percentileRanks(cands.map((c) => c.tech.mom12_1));
  cands = cands.map((c, i) => {
    const sDiv = A.clamp((1 - c.corr) * 100);
    const sTrend = momRank[i] == null || c.tech.distSma200 == null ? null : 0.6 * momRank[i] + 0.4 * (c.tech.distSma200 > 0 ? 100 : 0);
    const sEntry = A.entryScore(c.tech);
    const sCost = A.clamp((1 - c.ter / 0.65) * 100);
    const parts = { diversification: sDiv, trend: sTrend, entry: sEntry, cost: sCost };
    const score = Object.values(parts).some((v) => v == null) ? null : Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * parts[k], 0);
    return { ...c, parts, score };
  });
  cands.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return {
    generatedAt: new Date().toISOString(),
    snapshot: { source: portfolio.source, asOf: portfolio.asOf, parqet: portfolio.parqet },
    priceTime: pos[0].priceTime,
    weeks: n,
    summary: {
      value: total,
      cost,
      gain: total - cost,
      gainPct: total / cost - 1,
      vol: pfVol,
      maxDD: A.maxDrawdown([1, ...pfCurve]),
      ret1y: n > 52 ? pfCurve[n - 1] / pfCurve[n - 53] - 1 : null,
      divRatio: weightedVol / pfVol,
      avgCorr: avgOffDiag(corrMatrix),
    },
    positions: pos.map(({ wk, ...p }) => p),
    corrMatrix,
    candidates: cands,
    weights: WEIGHTS,
    addShare: ADD_SHARE,
    errors,
  };
}

function avgOffDiag(m) {
  let s = 0, c = 0;
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) { s += m[i][j]; c++; }
  return c ? s / c : null;
}

// Nachkauf-Logik für Bestandspositionen
function holdingSignal(p) {
  const t = p.tech;
  const overRisk = p.riskShare / p.weight > 1.15;
  if (t.distSma200 != null && t.distSma200 < 0) return { label: "Halten – nicht nachkaufen (Trend negativ)", tone: "bad" };
  if (overRisk) return { label: "Nicht aufstocken (überproportionaler Risikotreiber)", tone: "warn" };
  if (t.distHigh52 <= -0.05 || t.rsi14 < 45) return { label: "Nachkauf attraktiv (Rücksetzer im Aufwärtstrend)", tone: "good" };
  return { label: "Sparplan weiterlaufen lassen", tone: "neutral" };
}
