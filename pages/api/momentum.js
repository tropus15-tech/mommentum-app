import { fetchHistory } from "../../lib/yahoo";

function getMonthlyCloses(series) {
  const monthly = [];
  let lastMonth = null;
  for (let i = series.length - 1; i >= 0; i--) {
    const key = series[i].date.slice(0, 7);
    if (key !== lastMonth) {
      monthly.push(series[i].adj);
      lastMonth = key;
    }
  }
  return monthly;
}

function calcReturns(monthly) {
  const r = (n) => (monthly.length <= n ? 0 : (monthly[0] / monthly[n] - 1) * 100);
  return { r1: r(1), r3: r(3), r6: r(6), r12: r(12) };
}

function calcVolatility(monthly) {
  const returns = [];
  for (let i = 0; i < monthly.length - 1; i++) returns.push((monthly[i] / monthly[i + 1] - 1) * 100);
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  return Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length);
}

function calcScore(r, vol) {
  if (!vol) return 0;
  return (12 * r.r1 + 4 * r.r3 + 2 * r.r6 + r.r12) / vol;
}

async function getData(symbol) {
  const { series } = await fetchHistory(symbol, "2y");
  const monthly = getMonthlyCloses(series);
  const returns = calcReturns(monthly);
  const vol = calcVolatility(monthly);
  return { ...returns, vol, score: calcScore(returns, vol) };
}

export default async function handler(req, res) {
  try {
    const [xdem, xdev] = await Promise.all([getData("XDEM.DE"), getData("XDEV.DE")]);
    res.status(200).json({ xdem, xdev });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
}
