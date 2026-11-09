// Kandidaten-Universum: breit gestreute UCITS-ETFs/ETCs auf Xetra.
// ter in % p.a.; terVerified=true => per Websuche gegengeprüft (extraETF/justETF u.a., Stand 11/2026).
// Bei terVerified=false ist TER/ISIN NICHT verifiziert und wird im UI markiert.
export const UNIVERSE = [
  // Regionen
  { ticker: "IS3N.DE", isin: "IE00BKM4GZ66", name: "iShares Core MSCI EM IMI", cat: "Region", ter: 0.18, terVerified: true },
  { ticker: "EXSA.DE", isin: "DE0002635307", name: "iShares STOXX Europe 600", cat: "Region", ter: 0.2, terVerified: true },
  { ticker: "XDJP.DE", isin: null, name: "Xtrackers Nikkei 225", cat: "Region", ter: 0.09, terVerified: false },
  { ticker: "QDV5.DE", isin: null, name: "iShares MSCI India", cat: "Region", ter: 0.65, terVerified: false },
  // Faktoren / Size
  { ticker: "IUSN.DE", isin: "IE00BF4RFH31", name: "iShares MSCI World Small Cap", cat: "Faktor", ter: 0.35, terVerified: true },
  { ticker: "XDEV.DE", isin: "IE00BL25JM42", name: "Xtrackers MSCI World Value", cat: "Faktor", ter: 0.25, terVerified: true },
  { ticker: "IS3Q.DE", isin: "IE00BP3QZ601", name: "iShares Edge MSCI World Quality", cat: "Faktor", ter: 0.25, terVerified: true },
  { ticker: "XDEB.DE", isin: "IE00BL25JN58", name: "Xtrackers MSCI World Minimum Volatility", cat: "Faktor", ter: 0.25, terVerified: true },
  { ticker: "ZPRV.DE", isin: "IE00BSPLC413", name: "SPDR MSCI USA Small Cap Value Weighted", cat: "Faktor", ter: 0.3, terVerified: true },
  { ticker: "ZPRX.DE", isin: null, name: "SPDR MSCI Europe Small Cap Value Weighted", cat: "Faktor", ter: 0.3, terVerified: false },
  { ticker: "XDEW.DE", isin: "IE00BLNMYC90", name: "Xtrackers S&P 500 Equal Weight", cat: "Faktor", ter: 0.2, terVerified: true },
  // Sektoren (Nicht-Tech)
  { ticker: "XDWH.DE", isin: "IE00BM67HK77", name: "Xtrackers MSCI World Health Care", cat: "Sektor", ter: 0.25, terVerified: true },
  { ticker: "XDWS.DE", isin: "IE00BM67HN09", name: "Xtrackers MSCI World Consumer Staples", cat: "Sektor", ter: 0.25, terVerified: true },
  { ticker: "XDW0.DE", isin: "IE00BM67HM91", name: "Xtrackers MSCI World Energy", cat: "Sektor", ter: 0.25, terVerified: true },
  { ticker: "XDWU.DE", isin: null, name: "Xtrackers MSCI World Utilities", cat: "Sektor", ter: 0.25, terVerified: false },
  { ticker: "XDWF.DE", isin: null, name: "Xtrackers MSCI World Financials", cat: "Sektor", ter: 0.25, terVerified: false },
  // Rohstoffe
  { ticker: "4GLD.DE", isin: "DE000A0S9GB0", name: "Xetra-Gold (ETC)", cat: "Rohstoff", ter: 0.36, terVerified: true },
  { ticker: "SXRS.DE", isin: null, name: "iShares Diversified Commodity Swap", cat: "Rohstoff", ter: 0.19, terVerified: false },
  // Anleihen
  { ticker: "EUNH.DE", isin: "IE00B4WXJJ64", name: "iShares Core € Govt Bond", cat: "Anleihe", ter: 0.07, terVerified: true },
  { ticker: "IBCI.DE", isin: null, name: "iShares € Inflation Linked Govt Bond", cat: "Anleihe", ter: 0.09, terVerified: false },
  { ticker: "DBZB.DE", isin: null, name: "Xtrackers II Global Government Bond EUR Hedged", cat: "Anleihe", ter: 0.25, terVerified: false },
];
