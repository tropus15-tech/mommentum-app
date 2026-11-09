import { useEffect, useState } from "react";

export default function Home() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/momentum")
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div style={{ padding: 40 }}>Lade Daten…</div>;
  }

  const { xdem, xdev } = data;

  const total = xdem.score + xdev.score;

  const wXdem =
    total > 0
      ? Math.max(0, xdem.score) /
        (Math.max(0, xdem.score) + Math.max(0, xdev.score))
      : 0.5;

  const wXdev = 1 - wXdem;

  return (
    <div style={{ padding: 30, fontFamily: "system-ui" }}>
      <h1>Momentum Rechner</h1>

      <h2>XDEM (Momentum)</h2>
      <p>Score: {xdem.score.toFixed(2)}</p>

      <h2>XDEV (Value)</h2>
      <p>Score: {xdev.score.toFixed(2)}</p>

      <h2>Gewichtung</h2>
      <p>XDEM: {(wXdem * 100).toFixed(0)}%</p>
      <p>XDEV: {(wXdev * 100).toFixed(0)}%</p>
    </div>
  );
}
