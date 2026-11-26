// VIX + CNN Fear & Greed – Scriptable Widget (klein & mittel)
// Datenquellen: Yahoo Finance (^VIX), CNN dataviz (Fear & Greed Index)

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

async function getJSON(url, extraHeaders = {}) {
  const r = new Request(url);
  r.headers = { "User-Agent": UA, "Accept": "application/json", ...extraHeaders };
  r.timeoutInterval = 15;
  return await r.loadJSON();
}

async function getVIX() {
  try {
    const j = await getJSON("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1mo&interval=1d");
    const res = j.chart.result[0];
    const m = res.meta;
    const closes = (res.indicators.quote[0].close || []).filter(x => x != null);
    const price = m.regularMarketPrice;
    const prev = m.chartPreviousClose != null && closes.length < 2 ? m.chartPreviousClose : closes[closes.length - 2];
    const chg = m.regularMarketChangePercent ?? ((price / prev - 1) * 100);
    return { price, chg, closes, time: new Date(m.regularMarketTime * 1000) };
  } catch (e) { return null; }
}

async function getFG() {
  try {
    const j = await getJSON("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      "Referer": "https://edition.cnn.com/", "Origin": "https://edition.cnn.com"
    });
    const f = j.fear_and_greed;
    return {
      score: Math.round(f.score), rating: f.rating,
      prev: Math.round(f.previous_close), week: Math.round(f.previous_1_week),
      month: Math.round(f.previous_1_month)
    };
  } catch (e) { return null; }
}

// --- Farben / Labels ---
function vixColor(v) {
  if (v == null) return Color.gray();
  if (v < 15) return new Color("#30D158");
  if (v < 20) return new Color("#A8D930");
  if (v < 30) return new Color("#FF9F0A");
  return new Color("#FF453A");
}
function vixLabel(v) {
  if (v < 15) return "Ruhig";
  if (v < 20) return "Normal";
  if (v < 30) return "Erhöht";
  return "Stress";
}
function fgColor(s) {
  if (s == null) return Color.gray();
  if (s < 25) return new Color("#FF453A");
  if (s < 45) return new Color("#FF9F0A");
  if (s < 55) return new Color("#FFD60A");
  if (s < 75) return new Color("#A8D930");
  return new Color("#30D158");
}
const fgDE = { "extreme fear": "Extreme Angst", "fear": "Angst", "neutral": "Neutral", "greed": "Gier", "extreme greed": "Extreme Gier" };

// --- Mini-Grafiken ---
function sparkline(values, w, h, color) {
  const d = new DrawContext();
  d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true;
  if (values.length < 2) return d.getImage();
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const p = new Path();
  values.forEach((v, i) => {
    const pt = new Point(i / (values.length - 1) * w, h - 2 - (v - min) / rng * (h - 4));
    i === 0 ? p.move(pt) : p.addLine(pt);
  });
  d.addPath(p); d.setStrokeColor(color); d.setLineWidth(2); d.strokePath();
  return d.getImage();
}
function gaugeBar(score, w, h) {
  const d = new DrawContext();
  d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true;
  const cols = ["#FF453A", "#FF9F0A", "#FFD60A", "#A8D930", "#30D158"];
  const seg = w / cols.length;
  cols.forEach((c, i) => {
    d.setFillColor(new Color(c, 0.85));
    d.fillRect(new Rect(i * seg + 1, h / 2 - 2, seg - 2, 4));
  });
  if (score != null) {
    const x = Math.max(4, Math.min(w - 4, score / 100 * w));
    d.setFillColor(Color.white());
    d.fillEllipse(new Rect(x - 4, h / 2 - 4, 8, 8));
  }
  return d.getImage();
}

// --- Widget ---
const [vix, fg] = await Promise.all([getVIX(), getFG()]);
const fam = config.widgetFamily || "medium";

const w = new ListWidget();
const bg = new LinearGradient();
bg.colors = [new Color("#1C1C1E"), new Color("#0B0B0C")];
bg.locations = [0, 1];
w.backgroundGradient = bg;
w.setPadding(12, 14, 12, 14);
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = URLScheme.forRunningScript();

function block(stack, title, big, bigColor, sub, subColor) {
  const t = stack.addText(title);
  t.font = Font.semiboldSystemFont(11); t.textColor = new Color("#8E8E93");
  const b = stack.addText(big);
  b.font = Font.boldRoundedSystemFont(fam === "small" ? 26 : 30); b.textColor = bigColor;
  b.minimumScaleFactor = 0.6;
  const s = stack.addText(sub);
  s.font = Font.mediumSystemFont(11); s.textColor = subColor; s.lineLimit = 1;
}

if (fam === "small") {
  const vStack = w.addStack(); vStack.layoutVertically();
  block(vStack, "VIX",
    vix ? vix.price.toFixed(2) : "–", vixColor(vix?.price),
    vix ? `${vix.chg >= 0 ? "+" : ""}${vix.chg.toFixed(1)}% · ${vixLabel(vix.price)}` : "keine Daten",
    vix ? (vix.chg >= 0 ? new Color("#FF453A") : new Color("#30D158")) : Color.gray());
  w.addSpacer(6);
  const fStack = w.addStack(); fStack.layoutVertically();
  block(fStack, "FEAR & GREED",
    fg ? String(fg.score) : "–", fgColor(fg?.score),
    fg ? (fgDE[fg.rating] || fg.rating) : "keine Daten", fgColor(fg?.score));
} else {
  const row = w.addStack(); row.layoutHorizontally();

  const left = row.addStack(); left.layoutVertically(); left.size = new Size(140, 0);
  block(left, "VIX",
    vix ? vix.price.toFixed(2) : "–", vixColor(vix?.price),
    vix ? `${vix.chg >= 0 ? "+" : ""}${vix.chg.toFixed(1)}% · ${vixLabel(vix.price)}` : "keine Daten",
    vix ? (vix.chg >= 0 ? new Color("#FF453A") : new Color("#30D158")) : Color.gray());
  left.addSpacer(6);
  if (vix) {
    const img = left.addImage(sparkline(vix.closes, 130, 34, vixColor(vix.price)));
    img.imageSize = new Size(130, 34);
    const l = left.addText("1 Monat"); l.font = Font.systemFont(9); l.textColor = new Color("#636366");
  }

  row.addSpacer();

  const right = row.addStack(); right.layoutVertically(); right.size = new Size(140, 0);
  block(right, "FEAR & GREED",
    fg ? String(fg.score) : "–", fgColor(fg?.score),
    fg ? (fgDE[fg.rating] || fg.rating) : "keine Daten", fgColor(fg?.score));
  right.addSpacer(6);
  const g = right.addImage(gaugeBar(fg?.score, 130, 12)); g.imageSize = new Size(130, 12);
  right.addSpacer(4);
  if (fg) {
    const h = right.addText(`Vortag ${fg.prev} · 1W ${fg.week} · 1M ${fg.month}`);
    h.font = Font.systemFont(9); h.textColor = new Color("#8E8E93"); h.lineLimit = 1; h.minimumScaleFactor = 0.7;
  }
}

w.addSpacer();
const foot = w.addStack();
foot.addSpacer();
const df = new DateFormatter(); df.useShortTimeStyle();
const ft = foot.addText(`Stand ${df.string(new Date())}`);
ft.font = Font.systemFont(9); ft.textColor = new Color("#636366");

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
