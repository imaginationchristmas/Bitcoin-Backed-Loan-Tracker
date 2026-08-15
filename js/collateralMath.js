// collateralMath.js — pure collateral calculations. No DOM, no state.
// USD in integer cents, BTC in integer satoshis, prices in cents per BTC.

import { SATS_PER_BTC, satsToUsdCents, usdCentsToSats } from "./format.js";

/** Buffer (in percentage points of ratio) above margin call that separates green from yellow. */
export const HEALTH_BUFFER_PP = 0.10;

/**
 * Current collateral value in USD cents.
 */
export function collateralValueCents(collateralSats, priceCentsPerBtc) {
  return satsToUsdCents(collateralSats, priceCentsPerBtc);
}

/**
 * Collateral ratio = collateral value / remaining balance.
 * Returns Infinity when the balance is zero (fully collateralized / paid off).
 */
export function collateralRatio(collateralSats, priceCentsPerBtc, balanceCents) {
  if (balanceCents <= 0) return Infinity;
  return collateralValueCents(collateralSats, priceCentsPerBtc) / balanceCents;
}

/**
 * The BTC price (cents per BTC) at which the collateral ratio hits `targetPct`
 * (e.g. 150 -> 1.5) for a given balance. This is the "trigger price".
 *   ratio = (sats/SATS_PER_BTC * price) / balance  =>  price = balance*ratio*SATS_PER_BTC/sats
 * Returns 0 if there is no collateral or no balance.
 */
export function triggerPriceCents(balanceCents, collateralSats, targetPct) {
  if (collateralSats <= 0 || balanceCents <= 0) return 0;
  const ratio = targetPct / 100;
  return Math.round((balanceCents * ratio * SATS_PER_BTC) / collateralSats);
}

/**
 * Health band for a given ratio.
 *   'darkred' at/below liquidation, 'red' at/below margin call,
 *   'yellow' within the buffer above margin call, 'green' above that.
 * Paid-off loans (ratio Infinity) are 'green'.
 */
export function healthBand(ratio, marginCallPct, liquidationPct) {
  if (!isFinite(ratio)) return "green";
  const mc = marginCallPct / 100;
  const liq = liquidationPct / 100;
  if (ratio <= liq) return "darkred";
  if (ratio <= mc) return "red";
  if (ratio <= mc + HEALTH_BUFFER_PP) return "yellow";
  return "green";
}

export function healthLabel(band) {
  return {
    green: "Safe",
    yellow: "Approaching margin call",
    red: "Margin call — add collateral",
    darkred: "Liquidation risk",
  }[band] || "Unknown";
}

/**
 * Satoshis needed to bring the ratio up to `targetPct` at the current price.
 * Returns 0 if already at or above target.
 */
export function topUpSats(balanceCents, collateralSats, priceCentsPerBtc, targetPct) {
  if (priceCentsPerBtc <= 0 || balanceCents <= 0) return 0;
  const targetValueCents = Math.ceil(balanceCents * (targetPct / 100));
  const currentValueCents = collateralValueCents(collateralSats, priceCentsPerBtc);
  const shortfallCents = targetValueCents - currentValueCents;
  if (shortfallCents <= 0) return 0;
  return usdCentsToSats(shortfallCents, priceCentsPerBtc);
}

/**
 * Satoshis that could be released while keeping the ratio at or above
 * `targetPct` at the current price. Returns 0 if none can be released.
 */
export function releasableSats(balanceCents, collateralSats, priceCentsPerBtc, targetPct) {
  if (priceCentsPerBtc <= 0) return 0;
  if (balanceCents <= 0) return collateralSats; // paid off: everything is releasable
  const targetValueCents = Math.ceil(balanceCents * (targetPct / 100));
  const currentValueCents = collateralValueCents(collateralSats, priceCentsPerBtc);
  const excessCents = currentValueCents - targetValueCents;
  if (excessCents <= 0) return 0;
  return Math.min(collateralSats, usdCentsToSats(excessCents, priceCentsPerBtc));
}

/**
 * The initial collateral ratio at origination (e.g. 2.0 for 200%).
 */
export function initialRatio(loan) {
  if (loan.principalCents <= 0) return Infinity;
  return collateralValueCents(loan.collateralSats, loan.originationPriceCents) / loan.principalCents;
}

/**
 * Current collateral in satoshis, derived from the origination amount plus
 * any collateralAdd / collateralRelease events. This keeps the posted BTC
 * accurate over time as collateral moves.
 */
export function currentCollateralSats(loan, events) {
  let sats = loan.collateralSats;
  for (const e of events) {
    if (e.kind === "collateralAdd") sats += e.data.sats || 0;
    else if (e.kind === "collateralRelease") sats -= e.data.sats || 0;
  }
  return Math.max(0, sats);
}

/**
 * Full collateral snapshot for the UI at a given price and balance.
 * `collateralSats` is the CURRENT amount (from currentCollateralSats).
 */
export function collateralSnapshot(loan, balanceCents, priceCentsPerBtc, collateralSats) {
  const sats = collateralSats != null ? collateralSats : loan.collateralSats;
  const valueCents = collateralValueCents(sats, priceCentsPerBtc);
  const ratio = collateralRatio(sats, priceCentsPerBtc, balanceCents);
  const band = healthBand(ratio, loan.marginCallPct, loan.liquidationPct);
  const initRatio = initialRatio(loan);
  const initPct = isFinite(initRatio) ? initRatio * 100 : loan.marginCallPct + 50;
  return {
    collateralSats: sats,
    valueCents,
    ratio,
    band,
    label: healthLabel(band),
    marginCallPriceCents: triggerPriceCents(balanceCents, sats, loan.marginCallPct),
    liquidationPriceCents: triggerPriceCents(balanceCents, sats, loan.liquidationPct),
    topUpToInitialSats: topUpSats(balanceCents, sats, priceCentsPerBtc, initPct),
    topUpToMarginBufferSats: topUpSats(
      balanceCents, sats, priceCentsPerBtc,
      loan.marginCallPct + HEALTH_BUFFER_PP * 100
    ),
    releasableAtInitialSats: releasableSats(balanceCents, sats, priceCentsPerBtc, initPct),
    equityCents: valueCents - balanceCents,
    initialRatioPct: initPct,
  };
}
