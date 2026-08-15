// ui/simulator.js — what-if BTC price slider + early payoff comparison.

import { getState } from "../state.js";
import { computeLedger, earlyPayoffComparison, scheduledInterestTotals } from "../loanMath.js";
import { collateralSnapshot, currentCollateralSats } from "../collateralMath.js";
import { fmtUsd, fmtPct, fmtBtc } from "../format.js";

export function renderSimulator(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }
  const { loan, events, price } = s;
  const ledger = computeLedger(loan, events);
  const collateralSats = currentCollateralSats(loan, events);
  const { totalScheduledInterestCents } = scheduledInterestTotals(loan);

  // Slider range: from 50% below liquidation trigger to 2x current price.
  const lowPrice = Math.max(1000, Math.floor((snap => snap.liquidationPriceCents)(collateralSnapshot(loan, ledger.balanceCents, price.priceCents, collateralSats)) * 0.5));
  const highPrice = Math.max(price.priceCents * 2, lowPrice * 2);

  el.innerHTML = `
    <div class="card">
      <h2>What if Bitcoin moves?</h2>
      <p class="muted small-text">Drag to test a hypothetical BTC price against your current balance of ${fmtUsd(ledger.balanceCents)}.</p>
      <input type="range" id="sim-slider" min="${lowPrice}" max="${highPrice}" step="10000" value="${price.priceCents}">
      <div class="slider-value" id="sim-price-label">${fmtUsd(price.priceCents)}</div>
      <div id="sim-result"></div>
    </div>

    <div class="card">
      <h2>Early payoff</h2>
      <p class="muted small-text">See how much interest you save by paying the remaining balance off after a given month.</p>
      <div class="form-grid">
        <div class="field">
          <label for="sim-month">Pay off after month #</label>
          <input id="sim-month" type="number" min="1" max="${loan.termMonths}" value="${Math.min(6, loan.termMonths)}">
        </div>
      </div>
      <div id="payoff-result" style="margin-top:0.9rem"></div>
    </div>
  `;

  const $ = (id) => el.querySelector(id);

  function renderPriceSim(priceCents) {
    $("#sim-price-label").textContent = fmtUsd(priceCents);
    const snap = collateralSnapshot(loan, ledger.balanceCents, priceCents, collateralSats);
    const delta = priceCents - price.priceCents;
    const deltaPct = price.priceCents > 0 ? (delta / price.priceCents) * 100 : 0;
    $("#sim-result").innerHTML = `
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Projected ratio</div>
          <div class="stat-value">${fmtPct(snap.ratio)}</div>
          <div class="stat-sub"><span class="health ${snap.band}">${snap.label}</span></div>
        </div>
        <div class="stat">
          <div class="stat-label">Collateral value</div>
          <div class="stat-value">${fmtUsd(snap.valueCents)}</div>
          <div class="stat-sub">${delta >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs current</div>
        </div>
        <div class="stat">
          <div class="stat-label">Top-up needed</div>
          <div class="stat-value">${snap.topUpToInitialSats > 0 ? fmtBtc(snap.topUpToInitialSats) : "—"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Releasable</div>
          <div class="stat-value">${snap.releasableAtInitialSats > 0 ? fmtBtc(snap.releasableAtInitialSats) : "—"}</div>
        </div>
      </div>
      ${snap.band === "red" || snap.band === "darkred"
        ? `<div class="notice danger" style="margin-top:0.9rem">At ${fmtUsd(priceCents)}, this loan would ${snap.band === "darkred" ? "be at liquidation risk" : "trigger a margin call"}.</div>`
        : ""}
    `;
  }

  function renderPayoffSim(month) {
    const cmp = earlyPayoffComparison(loan, month);
    $("#payoff-result").innerHTML = `
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Balance after month ${month}</div>
          <div class="stat-value">${fmtUsd(cmp.payoffAmountCents)}</div>
          <div class="stat-sub">amount to pay off</div>
        </div>
        <div class="stat">
          <div class="stat-label">Interest paid by then</div>
          <div class="stat-value">${fmtUsd(cmp.interestPaidCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Interest saved</div>
          <div class="stat-value">${fmtUsd(cmp.interestSavedCents)}</div>
          <div class="stat-sub">vs ${fmtUsd(totalScheduledInterestCents)} full-term</div>
        </div>
      </div>
    `;
  }

  $("#sim-slider").addEventListener("input", (e) => renderPriceSim(Number(e.target.value)));
  $("#sim-month").addEventListener("input", (e) => {
    const m = parseInt(e.target.value, 10);
    if (Number.isInteger(m) && m >= 1 && m <= loan.termMonths) renderPayoffSim(m);
  });

  renderPriceSim(price.priceCents);
  renderPayoffSim(Math.min(6, loan.termMonths));
}
