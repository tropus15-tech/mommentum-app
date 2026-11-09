// Reine Rechenfunktionen – keine I/O.

const weekKey = (date) => Math.floor((Date.parse(date) / 86400000 + 3) / 7); // Wochen Mo–So

export function weeklyReturns(series) {
  const last = new Map();
  for (const p of series) last.set(weekKey(p.date), p.adj);
  const keys = [...last.keys()].sort((a, b) => a - b);
  const out = new Map();
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] - keys[i - 1] > 2) continue; // Datenlücke
    out.set(keys[i], last.get(keys[i]) / last.get(keys[i - 1]) - 1);
  }
  return out;
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
export function cov(a, b) {
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}
export const std = (a) => Math.sqrt(cov(a, a));
export const corr = (a, b) => cov(a, b) / (std(a) * std(b));
export const annVol = (a) => std(a) * Math.sqrt(52);

// Gemeinsame Wochen mehrerer Renditereihen -> ausgerichtete Arrays
export function align(maps) {
  const keys = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort((a, b) => a - b);
  return maps.map((m) => keys.map((k) => m.get(k)));
}

function priceMonthsAgo(series, months) {
  const d = new Date(series.at(-1).date);
  d.setMonth(d.getMonth() - months);
  const cut = d.toISOString().slice(0, 10);
  if (series[0].date > cut) return null;
  let p = null;
  for (const x of series) {
    if (x.date <= cut) p = x.adj;
    else break;
  }
  return p;
}

export function trailingReturn(series, months) {
  const p = priceMonthsAgo(series, months);
  return p ? series.at(-1).adj / p - 1 : null;
}

// 12-1-Momentum (Jegadeesh/Titman 1993): Rendite von t-12 bis t-1 Monate
export function momentum12_1(series) {
  const p12 = priceMonthsAgo(series, 12), p1 = priceMonthsAgo(series, 1);
  return p12 && p1 ? p1 / p12 - 1 : null;
}

export function sma(series, n) {
  if (series.length < n) return null;
  return mean(series.slice(-n).map((x) => x.adj));
}

export function rsi(series, n = 14) {
  if (series.length < n + 1) return null;
  const c = series.map((x) => x.adj);
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= n; l /= n;
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

function lastYear(series) {
  const d = new Date(series.at(-1).date);
  d.setFullYear(d.getFullYear() - 1);
  const cut = d.toISOString().slice(0, 10);
  return series.filter((x) => x.date >= cut);
}

export function distFromHigh52(series) {
  const y = lastYear(series);
  return series.at(-1).adj / Math.max(...y.map((x) => x.adj)) - 1;
}

export function maxDrawdown(values) {
  let peak = -Infinity, dd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    dd = Math.min(dd, v / peak - 1);
  }
  return dd;
}

export function technicals(series) {
  const last = series.at(-1).adj;
  const s200 = sma(series, 200);
  return {
    r1: trailingReturn(series, 1),
    r3: trailingReturn(series, 3),
    r6: trailingReturn(series, 6),
    r12: trailingReturn(series, 12),
    mom12_1: momentum12_1(series),
    distSma200: s200 ? last / s200 - 1 : null,
    distHigh52: distFromHigh52(series),
    maxDD1y: maxDrawdown(lastYear(series).map((x) => x.adj)),
    rsi14: rsi(series, 14),
  };
}

const clamp = (x, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));

// Einstiegs-Score: Rücksetzer im intakten Aufwärtstrend ist am attraktivsten.
export function entryScore(t) {
  if (t.distSma200 == null || t.rsi14 == null) return null;
  const rsiPart = clamp(((70 - t.rsi14) / 40) * 100); // RSI 30 -> 100, RSI 70 -> 0
  if (t.distSma200 < 0) return Math.round(0.4 * rsiPart); // Abwärtstrend: max. 40
  const stretchPart = clamp((1 - t.distSma200 / 0.2) * 100); // 0 % über SMA200 -> 100, >=20 % -> 0
  return Math.round(0.5 * rsiPart + 0.5 * stretchPart);
}

export function entrySignal(t) {
  if (t.distSma200 == null) return { label: "Zu wenig Daten", tone: "neutral" };
  if (t.distSma200 < 0) return { label: "Abwarten (unter 200-Tage-Linie)", tone: "bad" };
  if (t.rsi14 > 70 || t.distSma200 > 0.15) return { label: "In Tranchen (heiß gelaufen)", tone: "warn" };
  if (t.rsi14 < 55 || t.distHigh52 < -0.04) return { label: "Einstieg jetzt (Rücksetzer im Aufwärtstrend)", tone: "good" };
  return { label: "Einstieg ok (Aufwärtstrend)", tone: "good" };
}

export function percentileRanks(values) {
  const valid = values.filter((v) => v != null).sort((a, b) => a - b);
  return values.map((v) => {
    if (v == null) return null;
    if (valid.length === 1) return 50;
    return (valid.indexOf(v) / (valid.length - 1)) * 100;
  });
}

export { clamp, mean };
