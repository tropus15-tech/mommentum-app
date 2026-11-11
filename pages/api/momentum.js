import yahooFinance from "yahoo-finance2";

function getMonthlyCloses(data) {
  const monthly = [];
  let lastMonth = null;

  for (let i = data.length - 1; i >= 0; i--) {
    const d = new Date(data[i].date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;

    if (key !== lastMonth) {
      monthly.push(data[i].close);
      lastMonth = key;
    }
  }

  return monthly;
}

function calcReturns(monthly) {
  function r(n) {
    if (monthly.length <= n) return 0;
    return (monthly[0] / monthly[n] - 1) * 100;
  }

  return {
    r1: r(1),
    r3: r(3),
    r6: r(6),
    r12: r(12),
  };
}

function calcVolatility(monthly) {
  const returns = [];

  for (let i = 0; i < monthly.length - 1; i++) {
    returns.push((monthly[i] / monthly[i + 1] - 1) * 100);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;

  const variance =
    returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    returns.length;

  return Math.sqrt(variance);
}

function calcScore(r, vol) {
  if (!vol) return 0;
  return (12 * r.r1 + 4 * r.r3 + 2 * r.r6 + r.r12) / vol;
}

async function getData(symbol) {
  const now = new Date();
  const past = new Date();
  past.setFullYear(now.getFullYear() - 2);

  const data = await yahooFinance.historical(symbol, {
    period1: past,
    period2: now,
  });

  const monthly = getMonthlyCloses(data);
  const returns = calcReturns(monthly);
  const vol = calcVolatility(monthly);
  const score = calcScore(returns, vol);

  return { ...returns, vol, score };
}

export default async function handler(req, res) {
  try {
    const [xdem, xdev] = await Promise.all([
      getData("XDEM.DE"),
      getData("XDEV.DE"),
    ]);

    res.status(200).json({ xdem, xdev });
  } catch (e) {
    res.status(500).json({ error: "Fehler" });
  }
}
