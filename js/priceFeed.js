// priceFeed.js — CoinGecko BTC price fetch with manual override fallback.
// Free endpoint, no API key. Fetched on load and on manual refresh only
// (never on a timer) to stay well within rate limits.

import { setPrice, getState } from "./state.js";

const URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";

/**
 * Fetch the current BTC/USD price. On success, records it in state as an
 * 'auto' price update. Returns { ok, priceCents?, error? }.
 */
export async function fetchBtcPrice() {
  try {
    const res = await fetch(URL, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const usd = json && json.bitcoin && json.bitcoin.usd;
    if (typeof usd !== "number" || usd <= 0) {
      return { ok: false, error: "Unexpected response shape." };
    }
    const priceCents = Math.round(usd * 100);
    setPrice(priceCents, "auto");
    return { ok: true, priceCents };
  } catch (e) {
    return { ok: false, error: "Network error — using last known price." };
  }
}

/**
 * Current price info from state: { priceCents, updatedISO, manual } or null.
 */
export function currentPrice() {
  const s = getState();
  return s && s.price ? s.price : null;
}
