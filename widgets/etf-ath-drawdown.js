// ETF Abstand zum Allzeithoch – Scriptable Widget (klein, mittel, groß)
// Datenquelle: Yahoo Finance, tägliche Schlusskurse der kompletten Historie + aktueller Kurs
//
// ETFs per Widget-Parameter festlegen (Widget lange drücken → Bearbeiten → Parameter):
//   VWCE.DE=All-World, XDEM.DE=Momentum, XDWT.DE=World IT
// Ohne Parameter werden die DEFAULTS unten genutzt.

const DEFAULTS = "VWCE.DE=FTSE All-World, XDEM.DE=World Momentum, QDVE.DE=S&P 500 IT, XNAS.DE=Nasdaq 100, VDIV.DE=DM Dividend Leaders";
const ATH_CACHE_HOURS = 12; // volle Historie nur alle 12h neu laden, dazwischen ATH laufend fortschreiben

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), "etf-ath");
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir);

function parseList(s) {
  return s.split(/[,;\n]/).map(x => x.trim()).filter(Boolean).map(x => {
    const [sym, name] = x.split("=").map(y => y.trim());
    return { sym: sym.toUpperCase(), name: name || sym.toUpperCase() };
  });
}

async function getJSON(url) {
  const r = new Request(url);
  r.headers = { "User-Agent": UA, "Accept": "application/json" };
  r.timeoutInterval = 20;
  return await r.loadJSON();
}

function readCache(sym) {
  const p = fm.joinPath(cacheDir, sym.replace(/[^A-Z0-9.]/g, "_") + ".json");
  try { return fm.fileExists(p) ? JSON.parse(fm.readString(p)) : null; } catch (e) { return null; }
}
function writeCache(sym, obj) {
  const p = fm.joinPath(cacheDir, sym.replace(/[^A-Z0-9.]/g, "_") + ".json");
  fm.writeString(p, JSON.stringify(obj));
}

// Allzeithoch auf Basis täglicher Schlusskurse (volle Historie)
async function fetchFullATH(sym) {
  const now = Math.floor(Date.now() / 1000);
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${now}&interval=1d`);
  const r = j.chart.result[0];
  const closes = r.indicators.quote[0].close, ts = r.timestamp;
  let ath = -Infinity, athTs = null;
  for (let i = 0; i < closes.length; i++) {
    if (closes[i] != null && closes[i] > ath) { ath = closes[i]; athTs = ts[i]; }
  }
  return { ath, athTs, fetched: Date.now() };
}

async function getETF(item) {
  try {
    let c = readCache(item.sym);
    if (!c || Date.now() - c.fetched > ATH_CACHE_HOURS * 3600 * 1000) {
      try { c = await fetchFullATH(item.sym); writeCache(item.sym, c); } catch (e) { if (!c) throw e; }
    }
    // aktueller Kurs (leichter Abruf)
    const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.sym)}?range=1d&interval=5m`);
    const m = j.chart.result[0].meta;
    const price = m.regularMarketPrice;
    const prev = m.chartPreviousClose ?? m.previousClose;
    const chg = prev ? (price / prev - 1) * 100 : null;
    // neues Hoch seit letztem Komplett-Abruf → fortschreiben
    if (price > c.ath) { c.ath = price; c.athTs = m.regularMarketTime; writeCache(item.sym, c); }
    const dd = (price / c.ath - 1) * 100;
    return { ...item, price, chg, ath: c.ath, athDate: new Date(c.athTs * 1000), dd, cur: m.currency, time: new Date(m.regularMarketTime * 1000) };
  } catch (e) {
    return { ...item, error: true };
  }
}

// Farbe nach Drawdown
function ddColor(dd) {
  if (dd == null) return Color.gray();
  if (dd > -2) return new Color("#30D158");
  if (dd > -5) return new Color("#A8D930");
  if (dd > -10) return new Color("#FFD60A");
  if (dd > -20) return new Color("#FF9F0A");
  return new Color("#FF453A");
}

function ddBar(dd, w, h) {
  const d = new DrawContext();
  d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true;
  d.setFillColor(new Color("#3A3A3C"));
  const bg = new Path(); bg.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2); d.addPath(bg); d.fillPath();
  const frac = Math.min(1, Math.abs(Math.min(0, dd)) / 30); // Skala: 0 % bis −30 %
  if (frac > 0) {
    d.setFillColor(ddColor(dd));
    const p = new Path(); p.addRoundedRect(new Rect(0, 0, Math.max(h, w * frac), h), h / 2, h / 2); d.addPath(p); d.fillPath();
  }
  return d.getImage();
}

// --- Daten laden ---
const list = parseList(args.widgetParameter || DEFAULTS);
const fam = config.widgetFamily || "large";
const maxRows = { small: 3, medium: 5, large: 8, extraLarge: 8 }[fam] || 5;
const data = await Promise.all(list.slice(0, maxRows).map(getETF));

// --- Widget ---
const w = new ListWidget();
const bg = new LinearGradient();
bg.colors = [new Color("#1C1C1E"), new Color("#0B0B0C")];
bg.locations = [0, 1];
w.backgroundGradient = bg;
w.setPadding(12, 14, 10, 14);
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
w.url = URLScheme.forRunningScript();

const head = w.addStack();
const ht = head.addText(fam === "small" ? "VOM ATH" : "ABSTAND ZUM ALLZEITHOCH");
ht.font = Font.semiboldSystemFont(11); ht.textColor = new Color("#8E8E93");
w.addSpacer(fam === "large" ? 10 : 6);

const df = new DateFormatter(); df.dateFormat = "dd.MM.yy";
const nf = (x, d = 2) => x.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

for (const e of data) {
  const row = w.addStack(); row.layoutHorizontally(); row.centerAlignContent();

  const left = row.addStack(); left.layoutVertically();
  const n = left.addText(e.name); n.font = Font.semiboldSystemFont(fam === "small" ? 12 : 13);
  n.textColor = Color.white(); n.lineLimit = 1; n.minimumScaleFactor = 0.7;

  row.addSpacer();

  const v = row.addText(e.error ? "–" : `${e.dd > -0.005 ? "ATH" : nf(e.dd, 1) + "%"}`);
  v.font = Font.boldRoundedSystemFont(fam === "small" ? 14 : 16);
  v.textColor = e.error ? Color.gray() : ddColor(e.dd);
  v.rightAlignText();

  w.addSpacer(fam === "large" ? 9 : 5);
}

w.addSpacer();
const foot = w.addStack(); foot.addSpacer();
const tf = new DateFormatter(); tf.useShortTimeStyle();
const ft = foot.addText(`Stand ${tf.string(new Date())}`);
ft.font = Font.systemFont(9); ft.textColor = new Color("#636366");

if (config.runsInWidget) Script.setWidget(w);
else await w.presentMedium();
Script.complete();
