// format.js — display formatting helpers.
// Internal money is integer cents; BTC is integer satoshis. Format only at render.

export const SATS_PER_BTC = 100_000_000;

/** cents -> "$1,234.56" */
export function fmtUsd(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars.toLocaleString("en-US")}.${rem}`;
}

/** satoshis -> "0.03225806 BTC" */
export function fmtBtc(sats) {
  const btc = sats / SATS_PER_BTC;
  return `${btc.toFixed(8)} BTC`;
}

/** satoshis + price (cents per BTC) -> USD cents value */
export function satsToUsdCents(sats, priceCentsPerBtc) {
  return Math.round((sats / SATS_PER_BTC) * priceCentsPerBtc);
}

/** USD cents -> satoshis at a given price (cents per BTC) */
export function usdCentsToSats(usdCents, priceCentsPerBtc) {
  if (priceCentsPerBtc <= 0) return 0;
  return Math.round((usdCents / priceCentsPerBtc) * SATS_PER_BTC);
}

/** ISO date string -> "Jan 15, 2025" */
export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** ISO timestamp -> "Jan 15, 2025, 3:42 PM" */
export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** ratio (e.g. 1.5) -> "150.0%" */
export function fmtPct(ratio, digits = 1) {
  if (ratio == null || !isFinite(ratio)) return "—";
  return (ratio * 100).toFixed(digits) + "%";
}

/** Parse a user-entered dollar string -> integer cents (null if invalid) */
export function parseUsdToCents(str) {
  const n = Number(String(str).replace(/[$,\s]/g, ""));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Parse a user-entered BTC string -> satoshis (null if invalid) */
export function parseBtcToSats(str) {
  const n = Number(String(str).replace(/[,\s]/g, ""));
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * SATS_PER_BTC);
}

/** Today's date as YYYY-MM-DD (local) */
export function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Add n months to a YYYY-MM-DD date, clamping day to end of month. */
export function addMonths(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  const mm = String(target.getMonth() + 1).padStart(2, "0");
  const dd = String(target.getDate()).padStart(2, "0");
  return `${target.getFullYear()}-${mm}-${dd}`;
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T12:00:00");
  const b = new Date(isoB + "T12:00:00");
  return Math.round((b - a) / 86_400_000);
}
