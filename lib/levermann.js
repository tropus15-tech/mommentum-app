// Levermann-Strategie: 13 Kriterien, je -1 / 0 / +1 Punkt.
// Quelle der Regeln: Susan Levermann, "Der entspannte Weg zum Reichtum" (2010).
// Reine Funktionen ohne Datenabruf, damit sie testbar bleiben.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Punkte nach Schwellen: hoch ist gut (z. B. RoE) oder niedrig ist gut (KGV).
function band(value, good, bad, lowerIsBetter = false) {
  if (!isNum(value)) return null;
  if (lowerIsBetter) {
    if (value < good) return 1;
    if (value > bad) return -1;
    return 0;
  }
  if (value > good) return 1;
  if (value < bad) return -1;
  return 0;
}

function criterion(id, name, value, points, unit, note) {
  const missing = points === null || points === undefined;
  return {
    id,
    name,
    value: isNum(value) ? value : null,
    unit,
    points: missing ? 0 : points,
    missing,
    note: note || null,
  };
}

// KGV: negativer Gewinn zählt bei Levermann als -1.
function pePoints(pe, eps) {
  if (isNum(eps) && eps <= 0) return -1;
  return band(pe, 12, 16, true);
}

// Analystenmeinung auf Levermann-Skala 1 (Kauf) bis 3 (Verkauf).
export function analystMean({ buy, hold, sell }) {
  const n = buy + hold + sell;
  if (!n) return null;
  return (buy * 1 + hold * 2 + sell * 3) / n;
}

/**
 * @param {object} d Eingabedaten, fehlende Werte als null:
 *  roe, ebitMargin, equityRatio (in %), pe5, eps5, peCurrent, epsCurrent,
 *  analysts {buy, hold, sell}, earningsReaction (%-Punkte ggü. Index),
 *  epsRevision (%), perf6m (%), perf12m (%),
 *  reversal [{stock, index}] (letzte 3 Monate, älteste zuerst, in %),
 *  epsGrowth (%), isLargeCap (bool), isFinancial (bool)
 */
export function scoreLevermann(d) {
  const c = [];

  // 1. Eigenkapitalrendite letztes Geschäftsjahr
  c.push(criterion(1, "RoE (LJ)", d.roe, band(d.roe, 20, 10), "%"));

  // 2. EBIT-Marge letztes Geschäftsjahr (entfällt bei Finanzwerten)
  if (d.isFinancial) {
    c.push(criterion(2, "EBIT-Marge (LJ)", null, 0, "%", "entfällt bei Finanzwerten"));
  } else {
    c.push(criterion(2, "EBIT-Marge (LJ)", d.ebitMargin, band(d.ebitMargin, 12, 6), "%"));
  }

  // 3. Eigenkapitalquote (Finanzwerte: 10 % / 5 % statt 25 % / 15 %)
  c.push(
    criterion(
      3,
      "Eigenkapitalquote (LJ)",
      d.equityRatio,
      d.isFinancial ? band(d.equityRatio, 10, 5) : band(d.equityRatio, 25, 15),
      "%",
      d.isFinancial ? "Finanzwert: Schwellen 10 % / 5 %" : null
    )
  );

  // 4. KGV 5 Jahre (3 vergangene Jahre, aktuelles, nächstes)
  c.push(criterion(4, "KGV 5 Jahre", d.pe5, pePoints(d.pe5, d.eps5), "x"));

  // 5. KGV aktuelles Jahr
  c.push(criterion(5, "KGV aktuell", d.peCurrent, pePoints(d.peCurrent, d.epsCurrent), "x"));

  // 6. Analystenmeinungen: Kontraindikator, außer Small/Mid Caps mit <= 5 Analysten
  {
    const a = d.analysts;
    const n = a ? a.buy + a.hold + a.sell : 0;
    const mean = a ? analystMean(a) : null;
    let pts = null;
    let note = null;
    if (isNum(mean)) {
      const contrarian = d.isLargeCap || n > 5;
      if (mean >= 2.5) pts = contrarian ? 1 : -1;
      else if (mean <= 1.5) pts = contrarian ? -1 : 1;
      else pts = 0;
      note = `${n} Analysten, ${contrarian ? "Kontraindikator" : "prozyklisch (≤ 5 Analysten)"}`;
    }
    c.push(criterion(6, "Analystenmeinungen", mean, pts, "(1–3)", note));
  }

  // 7. Reaktion auf Quartalszahlen relativ zum Index
  c.push(
    criterion(
      7,
      "Reaktion auf Quartalszahlen",
      d.earningsReaction,
      band(d.earningsReaction, 1, -1),
      "%-Pkt."
    )
  );

  // 8. Gewinnrevisionen (EPS-Schätzung heute vs. vor 4 Wochen)
  c.push(criterion(8, "Gewinnrevisionen", d.epsRevision, band(d.epsRevision, 5, -5), "%"));

  // 9. Kurs heute vs. vor 6 Monaten
  const p6 = band(d.perf6m, 5, -5);
  c.push(criterion(9, "Kurs vs. 6 Monate", d.perf6m, p6, "%"));

  // 10. Kurs heute vs. vor 1 Jahr
  const p12 = band(d.perf12m, 5, -5);
  c.push(criterion(10, "Kurs vs. 1 Jahr", d.perf12m, p12, "%"));

  // 11. Kursmomentum steigend: 6M positiv und 12M nicht positiv (bzw. umgekehrt)
  {
    let pts = null;
    if (p6 !== null && p12 !== null) {
      if (p6 === 1 && p12 <= 0) pts = 1;
      else if (p6 === -1 && p12 >= 0) pts = -1;
      else pts = 0;
    }
    c.push(criterion(11, "Kursmomentum steigend", null, pts, ""));
  }

  // 12. Dreimonatsreversal (nur Large Caps)
  {
    let pts = null;
    let note = null;
    if (!d.isLargeCap) {
      pts = 0;
      note = "nur für Large Caps";
    } else if (Array.isArray(d.reversal) && d.reversal.length === 3) {
      const diffs = d.reversal.map((m) => m.stock - m.index);
      if (diffs.every((x) => x < 0)) pts = 1;
      else if (diffs.every((x) => x > 0)) pts = -1;
      else pts = 0;
      note = diffs.map((x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`).join(" / ") + " %-Pkt. vs. Index";
    }
    c.push(criterion(12, "Dreimonatsreversal", null, pts, "", note));
  }

  // 13. Gewinnwachstum (EPS nächstes vs. aktuelles Jahr)
  c.push(criterion(13, "Gewinnwachstum", d.epsGrowth, band(d.epsGrowth, 5, -5), "%"));

  const total = c.reduce((s, x) => s + x.points, 0);
  const missing = c.filter((x) => x.missing).map((x) => x.id);

  // Schwellen: Large Caps Kauf ab 4, Halten bei 3; Small/Mid Caps Kauf ab 7, Halten 5–6.
  const buyAt = d.isLargeCap ? 4 : 7;
  const holdAt = d.isLargeCap ? 3 : 5;
  const verdict = total >= buyAt ? "Kaufen" : total >= holdAt ? "Halten" : "Verkaufen";

  return { criteria: c, total, verdict, buyAt, holdAt, missing };
}
