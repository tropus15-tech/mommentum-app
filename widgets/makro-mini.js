// Makro – kleines Scriptable-Widget (2 × 2) im Stil der VIX- und ETF-Widgets
// EUR/USD · US-Rendite 10 J. · Gold · High-Yield-Spread
// Linien: Verlauf 1 Monat (Spread-Linie in der Farbe seiner Stufe)
// Quellen: Yahoo Finance (EURUSD=X, ^TNX, GC=F), FRED (BAMLH0A0HYM2, ICE BofA US High Yield OAS, 1 Handelstag Verzug)

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GREY = new Color("#8E8E93"), DIM = new Color("#636366");
const GREEN = new Color("#30D158"), RED = new Color("#FF453A"), WHITE = Color.white();

const nf = (x, d) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = x => (x >= 0 ? "+" : "");

async function yahoo(sym) {
  try {
    const r = new Request(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`);
    r.headers = { "User-Agent": UA, "Accept": "application/json" }; r.timeoutInterval = 15;
    const res = (await r.loadJSON()).chart.result[0], m = res.meta;
    const price = m.regularMarketPrice, pct = m.regularMarketChangePercent ?? 0;
    const prev = price / (1 + pct / 100);
    const closes = (res.indicators.quote[0].close || []).filter(x => x != null);
    return { price, pct, abs: price - prev, series: [...closes.slice(0, -1), price] };
  } catch (e) { return null; }
}

async function fredHY() {
  try {
    const r = new Request("https://fred.stlouisfed.org/graph/fredgraph.csv?id=BAMLH0A0HYM2");
    r.headers = { "User-Agent": UA }; r.timeoutInterval = 15;
    const rows = (await r.loadString()).trim().split("\n").slice(1)
      .map(l => l.split(",")).filter(x => x[1] && x[1] !== ".");
    const [d1, v1] = rows[rows.length - 1], [, v0] = rows[rows.length - 2];
    const series = rows.slice(-22).map(x => parseFloat(x[1]));
    return { value: parseFloat(v1), bp: Math.round((parseFloat(v1) - parseFloat(v0)) * 100), date: d1, series };
  } catch (e) { return null; }
}

// Einordnung High-Yield-Spread (eigene Faustregel)
function hyClass(v) {
  if (v < 3) return ["eng", GREEN];
  if (v < 4) return ["normal", new Color("#FFD60A")];
  if (v < 5) return ["erhöht", new Color("#FF9F0A")];
  return ["Stress", RED];
}

const [fx, tnx, gold, hy] = await Promise.all([yahoo("EURUSD=X"), yahoo("^TNX"), yahoo("GC=F"), fredHY()]);

const w = new ListWidget();
const bg = new LinearGradient();
bg.colors = [new Color("#1C1C1E"), new Color("#0B0B0C")]; bg.locations = [0, 1];
w.backgroundGradient = bg;
w.setPadding(12, 12, 10, 12);
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = URLScheme.forRunningScript();

// feste Spaltenbreite (kleines Widget ≈ 39 % der Bildschirmbreite), damit beide Spalten bündig sind
const sw = Math.min(Device.screenSize().width, Device.screenSize().height);
const cellW = Math.floor((sw * 0.39 - 24 - 12) / 2);

// Mini-Verlaufslinie (1 Monat), wie beim VIX-Widget
function spark(values, w, h, color) {
  const d = new DrawContext();
  d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true;
  if (values && values.length > 1) {
    const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
    const p = new Path();
    values.forEach((v, i) => {
      const pt = new Point(i / (values.length - 1) * w, h - 1.5 - (v - min) / rng * (h - 3));
      i === 0 ? p.move(pt) : p.addLine(pt);
    });
    d.addPath(p); d.setStrokeColor(color); d.setLineWidth(1.5); d.strokePath();
  }
  return d.getImage();
}

function cell(parent, label, value, valueColor, sub, subColor, series, lineColor) {
  const c = parent.addStack(); c.layoutVertically(); c.size = new Size(cellW, 0);
  const l = c.addText(label); l.font = Font.semiboldSystemFont(10); l.textColor = GREY; l.lineLimit = 1;
  const v = c.addText(value); v.font = Font.boldRoundedSystemFont(18); v.textColor = valueColor;
  v.lineLimit = 1; v.minimumScaleFactor = 0.7;
  const s = c.addText(sub); s.font = Font.mediumSystemFont(10); s.textColor = subColor; s.lineLimit = 1;
  s.minimumScaleFactor = 0.8;
  if (series) {
    c.addSpacer(3);
    const img = c.addImage(spark(series, cellW, 14, lineColor)); img.imageSize = new Size(cellW, 14);
  }
  return c;
}

function row(a, b) {
  const r = w.addStack(); r.layoutHorizontally(); r.topAlignContent();
  cell(r, ...a); r.addSpacer(12); cell(r, ...b); r.addSpacer();
}

const na = ["–", Color.gray(), "keine Daten", GREY, null, null];
const LINE = new Color("#8E8E93");
const hyC = hy ? hyClass(hy.value) : null;

row(
  // Farben = Wirkung auf deine Euro-ETFs: fallender Euro (stärkerer Dollar) hebt ihren Wert → grün
  ["EUR/USD", ...(fx ? [nf(fx.price, 4), WHITE, `${sign(fx.pct)}${nf(fx.pct, 2)}%`, fx.pct <= 0 ? GREEN : RED, fx.series, LINE] : na)],
  // steigende Rendite = Belastung für Aktien → rot
  ["US 10 J.", ...(tnx ? [`${nf(tnx.price, 2)}%`, WHITE, `${sign(tnx.abs)}${Math.round(tnx.abs * 100)} bp`, tnx.abs <= 0 ? GREEN : RED, tnx.series, LINE] : na)]
);
w.addSpacer(null);
row(
  ["GOLD", ...(gold ? [`${nf(gold.price, 0)} $`, WHITE, `${sign(gold.pct)}${nf(gold.pct, 1)}%`, gold.pct >= 0 ? GREEN : RED, gold.series, LINE] : na)],
  // steigender Spread = mehr Stress → rot
  // Wertfarbe = Stufe (grün eng · gelb normal · orange erhöht · rot Stress)
  ["SPREAD", ...(hy ? [`${nf(hy.value, 2)}%`, hyC[1], `${sign(hy.bp)}${hy.bp} bp`, hy.bp <= 0 ? GREEN : RED, hy.series, hyC[1]] : na)]
);
w.addSpacer(null);

const foot = w.addStack(); foot.addSpacer();
const tf = new DateFormatter(); tf.useShortTimeStyle();
const ft = foot.addText(`Stand ${tf.string(new Date())}`);
ft.font = Font.systemFont(9); ft.textColor = DIM;

if (config.runsInWidget) Script.setWidget(w);
else await w.presentSmall();
Script.complete();
