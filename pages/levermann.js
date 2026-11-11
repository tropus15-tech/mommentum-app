import { useState } from "react";
import Link from "next/link";

const DEFAULT = "SAP.DE, ALV.DE, SIE.DE, MUV2.DE, DTE.DE";
const COLORS = { Kaufen: "#1a7f37", Halten: "#9a6700", Verkaufen: "#cf222e" };

const cell = { padding: "6px 10px", borderBottom: "1px solid #ddd", textAlign: "left" };
const num = { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function fmt(v, unit) {
  if (v === null || v === undefined) return "–";
  return `${v.toFixed(unit === "(1–3)" ? 2 : 1)} ${unit || ""}`.trim();
}

function pointLabel(c) {
  if (c.missing) return "n/v";
  return c.points > 0 ? "+1" : c.points < 0 ? "−1" : "0";
}

function Detail({ r }) {
  return (
    <div style={{ margin: "8px 0 24px" }}>
      <p style={{ margin: "4px 0", color: "#555" }}>
        {r.isLargeCap ? "Large Cap" : "Small/Mid Cap"}
        {r.isFinancial ? " · Finanzwert" : ""} · Index {r.benchmark} · Kauf ab {r.buyAt}, Halten ab{" "}
        {r.holdAt} Punkten
        {r.fiscalYear ? ` · Geschäftsjahr bis ${r.fiscalYear}` : ""}
        {r.earningsDate ? ` · Quartalszahlen ${r.earningsDate}` : ""}
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={cell}>#</th>
            <th style={cell}>Kriterium</th>
            <th style={num}>Wert</th>
            <th style={num}>Punkte</th>
            <th style={cell}>Hinweis</th>
          </tr>
        </thead>
        <tbody>
          {r.criteria.map((c) => (
            <tr key={c.id}>
              <td style={cell}>{c.id}</td>
              <td style={cell}>{c.name}</td>
              <td style={num}>{fmt(c.value, c.unit)}</td>
              <td
                style={{
                  ...num,
                  fontWeight: 600,
                  color: c.missing ? "#888" : c.points > 0 ? COLORS.Kaufen : c.points < 0 ? COLORS.Verkaufen : "inherit",
                }}
              >
                {pointLabel(c)}
              </td>
              <td style={{ ...cell, color: "#555" }}>{c.note || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.warnings.length > 0 && (
        <p style={{ color: "#9a6700", margin: "8px 0" }}>Hinweise: {r.warnings.join(" · ")}</p>
      )}
    </div>
  );
}

export default function Levermann() {
  const [input, setInput] = useState(DEFAULT);
  const [cap, setCap] = useState("auto");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);

  async function run(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/levermann?symbols=${encodeURIComponent(input)}&cap=${cap}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Fehler");
      setData(json);
      setOpen(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 30, fontFamily: "system-ui", maxWidth: 900, margin: "0 auto" }}>
      <p>
        <Link href="/">← Momentum Rechner</Link>
      </p>
      <h1>Levermann-Screener</h1>
      <p style={{ color: "#555" }}>
        13 Kriterien, je −1 / 0 / +1 Punkt. Ticker im Yahoo-Format (z. B. SAP.DE, AAPL), maximal 15.
      </p>

      <form onSubmit={run} style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ticker"
          style={{ flex: "1 1 320px", padding: 8, fontSize: 16 }}
        />
        <select value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Größenklasse" style={{ padding: 8 }}>
          <option value="auto">Größe automatisch (≥ 5 Mrd. = Large)</option>
          <option value="large">Alle als Large Cap</option>
          <option value="small">Alle als Small/Mid Cap</option>
        </select>
        <button type="submit" disabled={loading} style={{ padding: "8px 16px", fontSize: 16 }}>
          {loading ? "Lade…" : "Bewerten"}
        </button>
      </form>

      {error && <p style={{ color: COLORS.Verkaufen }}>{error}</p>}

      {data && (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={cell}>Aktie</th>
                  <th style={num}>Kurs</th>
                  <th style={num}>Punkte</th>
                  <th style={cell}>Urteil</th>
                  <th style={num}>Fehlende Kriterien</th>
                  <th style={cell}></th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) =>
                  r.error ? (
                    <tr key={r.symbol}>
                      <td style={cell}>{r.symbol}</td>
                      <td style={{ ...cell, color: COLORS.Verkaufen }} colSpan={5}>
                        {r.error}
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.symbol}>
                      <td style={cell}>
                        <strong>{r.symbol}</strong> {r.name}
                      </td>
                      <td style={num}>
                        {r.price?.toFixed(2)} {r.currency}
                      </td>
                      <td style={{ ...num, fontWeight: 700 }}>{r.total}</td>
                      <td style={{ ...cell, fontWeight: 700, color: COLORS[r.verdict] }}>{r.verdict}</td>
                      <td style={num}>{r.missing.length ? r.missing.join(", ") : "–"}</td>
                      <td style={cell}>
                        <button onClick={() => setOpen(open === r.symbol ? null : r.symbol)}>
                          {open === r.symbol ? "Schließen" : "Details"}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

          {data.results
            .filter((r) => !r.error && r.symbol === open)
            .map((r) => (
              <div key={r.symbol}>
                <h2>
                  {r.name} ({r.symbol})
                </h2>
                <Detail r={r} />
              </div>
            ))}

          <p style={{ color: "#777", fontSize: 13 }}>
            Stand: {new Date(data.asOf).toLocaleString("de-DE")} · Datenquelle: Yahoo Finance. Fehlende
            Kriterien zählen 0 Punkte und können das Urteil verfälschen.
          </p>
        </>
      )}
    </div>
  );
}
