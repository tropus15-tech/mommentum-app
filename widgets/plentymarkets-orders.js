// plentymarkets Aufträge – Scriptable Widget (mittel empfohlen, klein möglich)
// Zeigt: Aufträge + Umsatz heute, gestern, 7 Tage, offene Aufträge, Balken der letzten 14 Tage
//
// EINRICHTUNG
// 1. In plentymarkets einen eigenen REST-Benutzer anlegen, der NUR Aufträge lesen darf
//    (Einrichtung → Konten → Benutzer; Rechte: REST-API → Aufträge → lesen).
// 2. Skript in Scriptable einmal mit ▶︎ starten: Es fragt System-URL, Benutzer und Passwort ab
//    und speichert sie im iOS-Schlüsselbund (nicht im Skript).
//    System-URL = Adresse deines Backends, z. B. https://p12345.my.plentysystems.com
// 3. Zum Ändern der Zugangsdaten: Skript in der App starten → „Zugangsdaten neu eingeben“.

const KC = { url: "plenty_url", user: "plenty_user", pass: "plenty_pass", token: "plenty_token" };
const DAYS = 14;        // Zeitraum für Balken und „offen“
const MAX_PAGES = 20;   // Sicherheitsgrenze: max. 20 × 250 Aufträge pro Abruf

const GREY = new Color("#8E8E93"), DIM = new Color("#636366"), WHITE = Color.white();
const GREEN = new Color("#30D158"), RED = new Color("#FF453A"), BLUE = new Color("#0A84FF"), ORANGE = new Color("#FF9F0A");
const eur = x => x.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const kc = k => Keychain.contains(k) ? Keychain.get(k) : null;

// ---------- Zugangsdaten ----------
async function askCredentials() {
  const a = new Alert();
  a.title = "plentymarkets Zugang";
  a.message = "Gespeichert im iOS-Schlüsselbund. Bitte einen REST-Benutzer mit reinen Leserechten für Aufträge verwenden.";
  a.addTextField("System-URL (https://…)", kc(KC.url) || "");
  a.addTextField("Benutzername", kc(KC.user) || "");
  a.addSecureTextField("Passwort", "");
  a.addAction("Speichern"); a.addCancelAction("Abbrechen");
  if (await a.present() === -1) return false;
  Keychain.set(KC.url, a.textFieldValue(0).trim().replace(/\/+$/, ""));
  Keychain.set(KC.user, a.textFieldValue(1).trim());
  Keychain.set(KC.pass, a.textFieldValue(2));
  if (Keychain.contains(KC.token)) Keychain.remove(KC.token);
  return true;
}

// ---------- API ----------
async function login(base) {
  const r = new Request(`${base}/rest/login`);
  r.method = "POST";
  r.headers = { "Content-Type": "application/json", "Accept": "application/json" };
  r.body = JSON.stringify({ username: kc(KC.user), password: kc(KC.pass) });
  const j = await r.loadJSON();
  if (!j.access_token) throw new Error("Login fehlgeschlagen" + (j.error ? `: ${j.error}` : ""));
  const tok = { t: j.access_token, exp: Date.now() + ((j.expires_in || 86400) - 600) * 1000 };
  Keychain.set(KC.token, JSON.stringify(tok));
  return tok.t;
}

async function token(base, force = false) {
  if (!force && kc(KC.token)) {
    try { const t = JSON.parse(kc(KC.token)); if (t.exp > Date.now()) return t.t; } catch (e) {}
  }
  return await login(base);
}

async function api(base, path, retried = false) {
  const r = new Request(`${base}${path}`);
  r.headers = { "Authorization": `Bearer ${await token(base, retried)}`, "Accept": "application/json" };
  r.timeoutInterval = 30;
  const j = await r.loadJSON();
  const code = r.response && r.response.statusCode;
  if (code === 401 && !retried) return api(base, path, true);   // Token abgelaufen → neu einloggen
  if (code && code >= 400) throw new Error(`API-Fehler ${code}` + (j && j.error ? `: ${j.error.message || j.error}` : ""));
  return j;
}

function isoStart(d) {
  // Mitternacht lokale Zeit als ISO-8601 mit Zeitzonen-Offset
  const off = -d.getTimezoneOffset(), s = off >= 0 ? "+" : "-", p = n => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00${s}${p(off / 60)}:${p(off % 60)}`;
}

async function loadOrders(base) {
  const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (DAYS - 1));
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const j = await api(base, `/rest/orders?createdAtFrom=${encodeURIComponent(isoStart(from))}&itemsPerPage=250&page=${page}&with[]=amounts`);
    out.push(...(j.entries || []));
    if (j.isLastPage || !j.entries || j.entries.length === 0) break;
  }
  // nur Aufträge (typeId 1), keine Gutschriften/Retouren usw.
  return out.filter(o => o.typeId == null || o.typeId === 1);
}

function gross(o) {
  const a = (o.amounts || []).find(x => x.isSystemCurrency) || (o.amounts || [])[0];
  return a ? Number(a.grossTotal) || 0 : 0;
}

// ---------- Auswertung ----------
function summarize(orders) {
  const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    days.push({ key: key(d), date: d, n: 0, rev: 0 });
  }
  const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
  let open = 0;
  for (const o of orders) {
    const i = idx[key(new Date(o.createdAt))];
    if (i != null) { days[i].n++; days[i].rev += gross(o); }
    if (Number(o.statusId) < 7) open++;   // Status < 7 = Warenausgang noch nicht gebucht
  }
  const last = days[days.length - 1], prev = days[days.length - 2];
  const week = days.slice(-7).reduce((s, d) => ({ n: s.n + d.n, rev: s.rev + d.rev }), { n: 0, rev: 0 });
  // Vergleich: heute vs. gestern bis zur gleichen Uhrzeit
  const now = new Date(), cut = new Date(now); cut.setDate(cut.getDate() - 1);
  const yStart = new Date(prev.date);
  const ySame = orders.filter(o => { const t = new Date(o.createdAt); return t >= yStart && t <= cut; }).length;
  return { days, today: last, yesterday: prev, week, open, ySame };
}

// ---------- Darstellung ----------
function bars(days, w, h) {
  const d = new DrawContext();
  d.size = new Size(w, h); d.opaque = false; d.respectScreenScale = true;
  const max = Math.max(1, ...days.map(x => x.n));
  const gap = 3, bw = (w - gap * (days.length - 1)) / days.length;
  days.forEach((x, i) => {
    const bh = Math.max(2, x.n / max * (h - 2));
    const isToday = i === days.length - 1, isWeekend = [0, 6].includes(x.date.getDay());
    d.setFillColor(isToday ? BLUE : new Color(isWeekend ? "#48484A" : "#8E8E93", isWeekend ? 1 : 0.7));
    const p = new Path(); p.addRoundedRect(new Rect(i * (bw + gap), h - bh, bw, bh), 2, 2);
    d.addPath(p); d.fillPath();
  });
  return d.getImage();
}

function errorWidget(msg) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#1C1C1E");
  const t = w.addText("PLENTYMARKETS"); t.font = Font.semiboldSystemFont(11); t.textColor = GREY;
  w.addSpacer(6);
  const m = w.addText(msg); m.font = Font.mediumSystemFont(12); m.textColor = RED;
  w.addSpacer();
  const h = w.addText("Zum Einrichten Skript in Scriptable starten"); h.font = Font.systemFont(9); h.textColor = DIM;
  return w;
}

function buildWidget(s, fam) {
  const w = new ListWidget();
  const bg = new LinearGradient();
  bg.colors = [new Color("#1C1C1E"), new Color("#0B0B0C")]; bg.locations = [0, 1];
  w.backgroundGradient = bg;
  w.setPadding(12, 14, 10, 14);
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const diff = s.today.n - s.ySame;
  const diffTxt = `${diff >= 0 ? "+" : ""}${diff} ggü. gestern`;

  if (fam === "small") {
    const l = w.addText("AUFTRÄGE HEUTE"); l.font = Font.semiboldSystemFont(10); l.textColor = GREY;
    const v = w.addText(String(s.today.n)); v.font = Font.boldRoundedSystemFont(30); v.textColor = WHITE;
    const r = w.addText(eur(s.today.rev)); r.font = Font.semiboldSystemFont(13); r.textColor = WHITE;
    const c = w.addText(diffTxt); c.font = Font.mediumSystemFont(10); c.textColor = diff >= 0 ? GREEN : RED;
    w.addSpacer(4);
    const o = w.addText(`${s.open} offen`); o.font = Font.mediumSystemFont(10); o.textColor = s.open > 0 ? ORANGE : GREY;
    w.addSpacer();
  } else {
    const top = w.addStack(); top.layoutHorizontally();
    const left = top.addStack(); left.layoutVertically();
    const l = left.addText("AUFTRÄGE HEUTE"); l.font = Font.semiboldSystemFont(11); l.textColor = GREY;
    const row = left.addStack(); row.layoutHorizontally(); row.bottomAlignContent();
    const v = row.addText(String(s.today.n)); v.font = Font.boldRoundedSystemFont(30); v.textColor = WHITE;
    row.addSpacer(8);
    const r = row.addText(eur(s.today.rev)); r.font = Font.semiboldSystemFont(15); r.textColor = WHITE;
    const c = left.addText(diffTxt); c.font = Font.mediumSystemFont(11); c.textColor = diff >= 0 ? GREEN : RED;

    top.addSpacer();
    const right = top.addStack(); right.layoutVertically();
    const kv = (k, val, col) => {
      const st = right.addStack(); st.layoutHorizontally();
      const a = st.addText(k); a.font = Font.mediumSystemFont(11); a.textColor = GREY;
      st.addSpacer(6);
      const b = st.addText(val); b.font = Font.semiboldSystemFont(11); b.textColor = col || WHITE;
      right.addSpacer(3);
    };
    kv("Gestern", `${s.yesterday.n} · ${eur(s.yesterday.rev)}`);
    kv("7 Tage", `${s.week.n} · ${eur(s.week.rev)}`);
    kv("Offen", String(s.open), s.open > 0 ? ORANGE : GREY);

    w.addSpacer(8);
    const img = w.addImage(bars(s.days, 300, 30)); img.imageSize = new Size(300, 30);
    w.addSpacer();
  }

  const foot = w.addStack();
  if (fam !== "small") { const f = foot.addText(`Aufträge pro Tag · ${DAYS} Tage · offen = Status < 7`); f.font = Font.systemFont(9); f.textColor = DIM; }
  foot.addSpacer();
  const tf = new DateFormatter(); tf.useShortTimeStyle();
  const ft = foot.addText(`Stand ${tf.string(new Date())}`); ft.font = Font.systemFont(9); ft.textColor = DIM;
  return w;
}

// ---------- Ablauf ----------
let widget, cancelled = false;
if (!config.runsInWidget) {
  if (!kc(KC.url)) { await askCredentials(); }
  else {
    const a = new Alert(); a.title = "plentymarkets Widget";
    a.addAction("Vorschau anzeigen"); a.addAction("Zugangsdaten neu eingeben"); a.addCancelAction("Abbrechen");
    const c = await a.present();
    if (c === 1) await askCredentials();
    if (c === -1) cancelled = true;
  }
}

const base = kc(KC.url);
if (cancelled) {
  widget = null;
} else if (!base) {
  widget = errorWidget("Keine Zugangsdaten gespeichert.");
} else {
  try {
    const s = summarize(await loadOrders(base));
    widget = buildWidget(s, config.widgetFamily || "medium");
  } catch (e) {
    widget = errorWidget(String(e.message || e));
    if (!config.runsInWidget) { const a = new Alert(); a.title = "Fehler"; a.message = String(e.message || e); a.addAction("OK"); await a.present(); }
  }
}

if (config.runsInWidget) Script.setWidget(widget);
else if (widget) await widget.presentMedium();
Script.complete();
