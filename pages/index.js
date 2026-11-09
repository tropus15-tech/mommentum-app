import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

const eur = (x, d = 0) => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x, d = 1) => (x == null ? "–" : `${x > 0 ? "+" : ""}${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
const pctAbs = (x, d = 1) => (x == null ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
const num = (x, d = 2) => (x == null ? "–" : x.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d }));
const cls = (x) => (x == null ? "" : x >= 0 ? "pos" : "neg");

function Bar({ value, max = 1, label }) {
  return (
    <span title={label}>
      <span className="bar"><i style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} /></span>
    </span>
  );
}

function Pct({ v, d }) {
  return <span className={cls(v)}>{pct(v, d)}</span>;
}

function Tile({ l, v, d, tone }) {
  return (
    <div className="tile">
      <div className="l">{l}</div>
      <div className={`v ${tone || ""}`}>{v}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

function reasons(c, addShare) {
  const out = [];
  out.push(`Korrelation zum Depot ${num(c.corr)} · Beta ${num(c.beta)}`);
  out.push(`${pctAbs(addShare, 0)} Beimischung ändert Depot-Vola um ${pct(c.dVol, 2).replace(" %", " %-Pkt.")}`);
  out.push(`12-1-Momentum ${pct(c.tech.mom12_1)} · ${pct(c.tech.distSma200)} ggü. 200-Tage-Linie`);
  out.push(`${pct(c.tech.distHigh52)} unter 52-Wochen-Hoch · RSI ${num(c.tech.rsi14, 0)}`);
  return out;
}

export default function Home() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [cat, setCat] = useState("Alle");

  useEffect(() => {
    fetch("/api/depot")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Fehler");
        setData(j);
      })
      .catch((e) => setErr(e.message));
  }, []);

  const cats = useMemo(() => (data ? ["Alle", ...new Set(data.candidates.map((c) => c.cat))] : []), [data]);

  if (err) return <main><h1>Depot-Cockpit</h1><p className="neg">Fehler beim Laden: {err}</p></main>;
  if (!data) return <main><h1>Depot-Cockpit</h1><p>Lade Kursdaten…</p></main>;

  const { summary: s, positions, candidates, corrMatrix, snapshot, weights } = data;
  const maxW = Math.max(...positions.map((p) => Math.max(p.weight, p.riskShare)));
  const shown = candidates.filter((c) => cat === "Alle" || c.cat === cat);
  const buyable = candidates.filter((c) => c.score != null && c.signal.tone !== "bad");
  const top = [];
  for (const c of buyable) {
    if (!top.some((t) => t.cat === c.cat)) top.push(c); // beste Idee je Kategorie
    if (top.length === 3) break;
  }
  const techRisk = positions.filter((p) => /IT|Nasdaq|Technology/i.test(p.short)).reduce((a, p) => a + p.weight, 0);

  return (
    <main>
      <Head><title>Depot-Cockpit</title></Head>
      <h1>Depot-Cockpit</h1>
      <p className="sub">
        Bestand: {snapshot.source}, Stand {snapshot.asOf} · Kurse: Yahoo Finance (Xetra), {data.priceTime ? new Date(data.priceTime).toLocaleString("de-DE") : "–"} ·
        Risiko-Kennzahlen auf Basis von {data.weeks} Wochenrenditen · <a href="/momentum">Momentum-Rechner</a>
      </p>

      <div className="tiles">
        <Tile l="Depotwert" v={eur(s.value)} d={`Einstand ${eur(s.cost)}`} />
        <Tile l="Buchgewinn offene Positionen" v={eur(s.gain)} tone={cls(s.gain)} d={pct(s.gainPct)} />
        <Tile l="Rendite seit Start (Parqet)" v={`${num(snapshot.parqet.xirr, 1)} % p.a.`} d={`XIRR · TTWROR ${num(snapshot.parqet.ttwror, 1)} % · seit ${snapshot.parqet.since}`} />
        <Tile l="Volatilität p.a." v={pctAbs(s.vol)} d="aktuelle Gewichte, rückgerechnet" />
        <Tile l="Max. Drawdown" v={pct(s.maxDD)} d={`aktuelle Gewichte, ${Math.round(data.weeks / 52)} Jahre`} />
        <Tile l="Ø Korrelation der Positionen" v={num(s.avgCorr)} d={`Diversifikationsquote ${num(s.divRatio)}`} />
      </div>

      {(s.avgCorr > 0.85 || techRisk > 0.2) && (
        <div className="alert">
          <b>Klumpenrisiko:</b> Die Positionen korrelieren im Schnitt mit {num(s.avgCorr)} – das Depot verhält sich fast wie ein einziger Fonds.{" "}
          {pctAbs(techRisk, 0)} liegen in reinen Tech-/Nasdaq-ETFs, zusätzlich zum Tech-Anteil im All-World und im Momentum-ETF.
          Realisierte Gewinne laut Parqet: {eur(snapshot.parqet.realizedGainNet)} bei {snapshot.parqet.soldHoldings} bereits wieder verkauften Positionen und {eur(snapshot.parqet.fees)} Gebühren.
        </div>
      )}

      <div className="card">
        <h2>Positionen & Nachkauf-Signal</h2>
        <p className="sub">Risikoanteil = Beitrag der Position zur Depot-Varianz. Liegt er klar über dem Gewicht, treibt die Position das Depotrisiko überproportional.</p>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Position</th><th>Wert</th><th className="l">Gewicht</th><th className="l">Risikoanteil</th><th>G/V</th><th>1M</th><th>3M</th><th>12M</th><th>Vola</th><th>vs. 52W-Hoch</th><th>vs. SMA200</th><th>RSI</th></tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.ticker}>
                  <td>{p.name}<div className="tk">{p.ticker} · {p.isin}</div><div style={{ marginTop: 4 }}><span className={`pill ${p.signal.tone}`}>{p.signal.label}</span></div></td>
                  <td>{eur(p.value)}</td>
                  <td className="l"><Bar value={p.weight} max={maxW} />{pctAbs(p.weight)}</td>
                  <td className="l"><Bar value={p.riskShare} max={maxW} />{pctAbs(p.riskShare)}</td>
                  <td><Pct v={p.gainPct} /></td>
                  <td><Pct v={p.tech.r1} /></td>
                  <td><Pct v={p.tech.r3} /></td>
                  <td><Pct v={p.tech.r12} /></td>
                  <td>{pctAbs(p.vol)}</td>
                  <td>{pct(p.tech.distHigh52)}</td>
                  <td><Pct v={p.tech.distSma200} /></td>
                  <td>{num(p.tech.rsi14, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Korrelation der Positionen untereinander</h2>
        <p className="sub">Wochenrenditen in EUR. 1,00 = perfekter Gleichlauf; echte Diversifikation beginnt deutlich unter 0,7.</p>
        <div className="scroll">
          <table className="heat">
            <thead><tr><th></th>{positions.map((p) => <th key={p.ticker}>{p.short}</th>)}</tr></thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={p.ticker}>
                  <td>{p.short}</td>
                  {corrMatrix[i].map((c, j) => (
                    <td key={j} className="c" title={`${p.short} × ${positions[j].short}: ${num(c)}`}
                      style={{ background: `color-mix(in srgb, var(--series) ${Math.round(Math.max(0, c) * 45)}%, transparent)` }}>
                      {num(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Attraktivste Ergänzungen</h2>
        <p className="sub">Beste Idee je Anlageklasse nach Gesamtscore – nur Kandidaten ohne negatives Trendsignal.</p>
        <div className="recs">
          {top.map((c, i) => (
            <div className="rec" key={c.ticker}>
              <div className="tk">#{i + 1} · {c.cat} · Score {num(c.score, 0)}</div>
              <b>{c.name}</b>
              <div className="tk">{c.ticker}{c.isin ? ` · ${c.isin}` : ""} · TER {num(c.ter)} %{c.terVerified ? "" : " (ungeprüft)"}</div>
              <div style={{ marginTop: 6 }}><span className={`pill ${c.signal.tone}`}>{c.signal.label}</span></div>
              <ul>{reasons(c, data.addShare).map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Kandidaten-Ranking</h2>
        <p className="sub">
          Score = {Math.round(weights.diversification * 100)} % Diversifikation + {Math.round(weights.trend * 100)} % Trend + {Math.round(weights.entry * 100)} % Einstieg + {Math.round(weights.cost * 100)} % Kosten.
          Δ Vola = Änderung der Depot-Volatilität bei {pctAbs(data.addShare, 0)} Beimischung (anteilig aus allen Positionen finanziert).
        </p>
        <div className="filters">
          {cats.map((c) => <button key={c} className={c === cat ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>ETF</th><th className="l">Score</th><th>Korr.</th><th>Δ Vola</th><th>Vola</th><th>1M</th><th>3M</th><th>12M</th><th>Mom 12-1</th><th>vs. SMA200</th><th>vs. 52W-Hoch</th><th>RSI</th><th>TER</th></tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.ticker}>
                  <td>{c.name}<div className="tk">{c.ticker} · {c.cat}{c.isin ? ` · ${c.isin}` : ""}</div><div style={{ marginTop: 4 }}><span className={`pill ${c.signal.tone}`}>{c.signal.label}</span></div></td>
                  <td className="l" title={c.score == null ? "" : `Diversifikation ${num(c.parts.diversification, 0)} · Trend ${num(c.parts.trend, 0)} · Einstieg ${num(c.parts.entry, 0)} · Kosten ${num(c.parts.cost, 0)}`}>
                    <Bar value={c.score ?? 0} max={100} />{num(c.score, 0)}
                  </td>
                  <td>{num(c.corr)}</td>
                  <td><span className={c.dVol <= 0 ? "pos" : "neg"}>{pct(c.dVol, 2)}</span></td>
                  <td>{pctAbs(c.vol)}</td>
                  <td><Pct v={c.tech.r1} /></td>
                  <td><Pct v={c.tech.r3} /></td>
                  <td><Pct v={c.tech.r12} /></td>
                  <td><Pct v={c.tech.mom12_1} /></td>
                  <td><Pct v={c.tech.distSma200} /></td>
                  <td>{pct(c.tech.distHigh52)}</td>
                  <td>{num(c.tech.rsi14, 0)}</td>
                  <td title={c.terVerified ? "per Websuche geprüft, Stand 11/2026" : "nicht verifiziert – vor Kauf prüfen"}>{num(c.ter)} %{c.terVerified ? "" : " ?"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card note">
        <h2>Methodik & Grenzen</h2>
        <ul>
          <li><b>Diversifikation:</b> Korrelation der Wochenrenditen (EUR) zum Depot mit heutigen Gewichten; Score = (1 − Korrelation) × 100. Grundlage: Markowitz (1952) – der Risikobeitrag einer Ergänzung hängt von ihrer Kovarianz zum Bestand ab, nicht von ihrer Einzel-Vola.</li>
          <li><b>Trend:</b> 60 % Rang im 12-1-Monats-Momentum (Jegadeesh/Titman 1993), 40 % Kurs über 200-Tage-Linie (Faber 2007: Trendfilter senkte historisch v. a. Drawdowns, nicht zwingend die Rendite).</li>
          <li><b>Einstieg:</b> Heuristik „Rücksetzer im Aufwärtstrend“ aus RSI(14) und Abstand zur 200-Tage-Linie. Die Evidenz für kurzfristiges Timing ist schwach; das Signal entscheidet über Einmalkauf vs. Tranchen, nicht über das Ob.</li>
          <li><b>Kosten:</b> TER linear (0 % = 100 Punkte, 0,65 % = 0). Mit „?“ markierte TERs sind nicht verifiziert.</li>
          <li>Depot-Vola, Drawdown und Korrelationen sind mit den <i>heutigen</i> Gewichten rückgerechnet – nicht die tatsächliche Depot-Historie. Korrelationen sind instabil und steigen in Crashs typischerweise an.</li>
          <li>Bestand ist ein Parqet-Snapshot (<code>data/portfolio.json</code>); nach Käufen/Verkäufen dort Stückzahlen aktualisieren. Keine Anlageberatung im Rechtssinn.</li>
        </ul>
        {Object.keys(data.errors || {}).length > 0 && <p>Ohne Kursdaten: {Object.keys(data.errors).join(", ")}</p>}
      </div>
    </main>
  );
}
