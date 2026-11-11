import test from "node:test";
import assert from "node:assert/strict";
import { scoreLevermann, analystMean } from "./levermann.js";

const base = {
  roe: 25, ebitMargin: 15, equityRatio: 30,
  pe5: 10, eps5: 5, peCurrent: 11, epsCurrent: 5,
  analysts: { buy: 2, hold: 2, sell: 16 },
  earningsReaction: 2, epsRevision: 6,
  perf6m: 10, perf12m: 0,
  reversal: [{ stock: -1, index: 1 }, { stock: 0, index: 2 }, { stock: 1, index: 3 }],
  epsGrowth: 8, isLargeCap: true, isFinancial: false,
};
const pts = (r) => Object.fromEntries(r.criteria.map((c) => [c.id, c.points]));

test("Bestfall Large Cap: 12 Punkte (Kriterium 10 neutral), Kaufen", () => {
  const r = scoreLevermann(base);
  assert.equal(r.total, 12);
  assert.equal(pts(r)[10], 0);
  assert.equal(pts(r)[11], 1);
  assert.equal(r.verdict, "Kaufen");
  assert.deepEqual(r.missing, []);
});

test("Schlechtfall: alle Kriterien negativ", () => {
  const r = scoreLevermann({
    ...base, roe: 5, ebitMargin: 3, equityRatio: 10, pe5: 20, peCurrent: 30,
    analysts: { buy: 18, hold: 1, sell: 1 }, earningsReaction: -3, epsRevision: -8,
    perf6m: -10, perf12m: 0,
    reversal: [{ stock: 3, index: 1 }, { stock: 2, index: 0 }, { stock: 1, index: -1 }],
    epsGrowth: -10,
  });
  assert.equal(r.total, -12);
  assert.equal(r.verdict, "Verkaufen");
});

test("Negativer Gewinn: KGV zählt -1", () => {
  const r = scoreLevermann({ ...base, peCurrent: null, epsCurrent: -2, pe5: null, eps5: -1 });
  assert.equal(pts(r)[4], -1);
  assert.equal(pts(r)[5], -1);
});

test("Finanzwert: EBIT-Marge entfällt, EK-Quote 10/5", () => {
  const r = scoreLevermann({ ...base, isFinancial: true, ebitMargin: null, equityRatio: 11 });
  assert.equal(pts(r)[2], 0);
  assert.equal(pts(r)[3], 1);
  assert.ok(!r.missing.includes(2));
});

test("Small Cap: Analysten prozyklisch bei <= 5, kein Reversal, Kauf ab 7", () => {
  const r = scoreLevermann({ ...base, isLargeCap: false, analysts: { buy: 4, hold: 0, sell: 0 } });
  assert.equal(pts(r)[6], 1);
  assert.equal(pts(r)[12], 0);
  assert.equal(r.buyAt, 7);
  const many = scoreLevermann({ ...base, isLargeCap: false, analysts: { buy: 10, hold: 0, sell: 0 } });
  assert.equal(pts(many)[6], -1);
});

test("Fehlende Daten: 0 Punkte und als fehlend markiert", () => {
  const r = scoreLevermann({ ...base, roe: null, earningsReaction: null, reversal: null });
  assert.deepEqual(r.missing, [1, 7, 12]);
  assert.equal(r.total, 9);
});

test("Schwellen Large Cap: 4 Kaufen, 3 Halten, 2 Verkaufen", () => {
  const neutral = {
    roe: 15, ebitMargin: 8, equityRatio: 20, pe5: 14, eps5: 1, peCurrent: 14, epsCurrent: 1,
    analysts: { buy: 1, hold: 8, sell: 1 }, earningsReaction: 0, epsRevision: 0,
    perf6m: 0, perf12m: 0,
    reversal: [{ stock: 1, index: 0 }, { stock: 0, index: 1 }, { stock: 0, index: 0 }],
    epsGrowth: 0, isLargeCap: true, isFinancial: false,
  };
  assert.equal(scoreLevermann(neutral).total, 0);
  const four = scoreLevermann({ ...neutral, roe: 25, ebitMargin: 15, equityRatio: 30, pe5: 10 });
  assert.equal(four.verdict, "Kaufen");
  assert.equal(scoreLevermann({ ...neutral, roe: 25, ebitMargin: 15, equityRatio: 30 }).verdict, "Halten");
  assert.equal(scoreLevermann({ ...neutral, roe: 25, ebitMargin: 15 }).verdict, "Verkaufen");
});

test("analystMean", () => {
  assert.equal(analystMean({ buy: 1, hold: 1, sell: 1 }), 2);
  assert.equal(analystMean({ buy: 0, hold: 0, sell: 0 }), null);
});
