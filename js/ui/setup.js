// ui/setup.js — initial loan setup form. Pre-filled with the spec example.

import { createLoan } from "../state.js";
import { parseUsdToCents, usdCentsToSats, todayISO, fmtUsd, fmtBtc } from "../format.js";
import { amortizedPaymentCents } from "../loanMath.js";

const EXAMPLE = {
  principal: "1000",
  rate: "5",
  term: "12",
  collateral: "2000",
  price: "62000",
  type: "amortized",
  marginCall: "150",
  liquidation: "120",
};

export function renderSetup(el) {
  el.innerHTML = `
    <div class="card">
      <h2>Set up the loan</h2>
      <p class="muted small-text">
        Enter the agreed terms. The collateral in BTC is locked at the current
        price — only its USD value floats afterward.
      </p>
      <div class="form-grid">
        <div class="field">
          <label for="f-principal">Loan amount (USD)</label>
          <input id="f-principal" type="text" inputmode="decimal" value="${EXAMPLE.principal}">
        </div>
        <div class="field">
          <label for="f-rate">Annual interest rate (%)</label>
          <input id="f-rate" type="text" inputmode="decimal" value="${EXAMPLE.rate}">
        </div>
        <div class="field">
          <label for="f-term">Term (months)</label>
          <input id="f-term" type="text" inputmode="numeric" value="${EXAMPLE.term}">
        </div>
        <div class="field">
          <label for="f-type">Payment type</label>
          <select id="f-type">
            <option value="amortized" selected>Amortized (principal + interest)</option>
            <option value="interestOnly">Interest-only (balloon at end)</option>
          </select>
        </div>
        <div class="field">
          <label for="f-collateral">Collateral value (USD)</label>
          <input id="f-collateral" type="text" inputmode="decimal" value="${EXAMPLE.collateral}">
        </div>
        <div class="field">
          <label for="f-price">Current BTC price (USD)</label>
          <input id="f-price" type="text" inputmode="decimal" value="${EXAMPLE.price}">
          <div class="hint" id="price-hint"></div>
        </div>
        <div class="field">
          <label for="f-margin">Margin call threshold (%)</label>
          <input id="f-margin" type="text" inputmode="decimal" value="${EXAMPLE.marginCall}">
        </div>
        <div class="field">
          <label for="f-liquidation">Liquidation threshold (%)</label>
          <input id="f-liquidation" type="text" inputmode="decimal" value="${EXAMPLE.liquidation}">
        </div>
        <div class="field">
          <label for="f-start">Loan start date</label>
          <input id="f-start" type="date" value="${todayISO()}">
        </div>
      </div>

      <div id="setup-preview"></div>
      <div id="setup-error"></div>
      <div class="btn-row">
        <button class="btn" id="btn-create">Create loan</button>
      </div>
    </div>
  `;

  const $ = (id) => el.querySelector(id);

  function preview() {
    const principalCents = parseUsdToCents($("#f-principal").value);
    const rate = Number($("#f-rate").value);
    const term = parseInt($("#f-term").value, 10);
    const collateralCents = parseUsdToCents($("#f-collateral").value);
    const priceCents = parseUsdToCents($("#f-price").value);
    const type = $("#f-type").value;
    const errEl = $("#setup-error");
    const prevEl = $("#setup-preview");
    errEl.innerHTML = "";
    prevEl.innerHTML = "";

    if (!principalCents || !rate || !term || !collateralCents || !priceCents) return;
    if (type === "amortized") {
      const pmt = amortizedPaymentCents(principalCents, rate, term);
      prevEl.innerHTML = `<p class="small-text muted">Monthly payment: <strong>${fmtUsd(pmt)}</strong></p>`;
    } else {
      const interest = Math.round((principalCents / 100) * (rate / 100 / 12) * 100);
      prevEl.innerHTML = `<p class="small-text muted">Monthly interest: <strong>${fmtUsd(interest)}</strong> + ${fmtUsd(principalCents)} balloon at maturity</p>`;
    }
    const sats = usdCentsToSats(collateralCents, priceCents);
    prevEl.innerHTML += `<p class="small-text muted">BTC collateral to post: <strong>${fmtBtc(sats)}</strong></p>`;
  }

  el.querySelectorAll("input, select").forEach((i) => i.addEventListener("input", preview));
  preview();

  $("#btn-create").addEventListener("click", () => {
    const principalCents = parseUsdToCents($("#f-principal").value);
    const rate = Number($("#f-rate").value);
    const term = parseInt($("#f-term").value, 10);
    const collateralCents = parseUsdToCents($("#f-collateral").value);
    const priceCents = parseUsdToCents($("#f-price").value);
    const marginCall = Number($("#f-margin").value);
    const liquidation = Number($("#f-liquidation").value);
    const type = $("#f-type").value;
    const startDateISO = $("#f-start").value;
    const errEl = $("#setup-error");

    const errors = [];
    if (!principalCents || principalCents <= 0) errors.push("Enter a valid loan amount.");
    if (!isFinite(rate) || rate < 0 || rate > 100) errors.push("Enter a valid interest rate (0–100).");
    if (!Number.isInteger(term) || term <= 0 || term > 360) errors.push("Enter a valid term in months.");
    if (!collateralCents || collateralCents <= 0) errors.push("Enter a valid collateral value.");
    if (!priceCents || priceCents <= 0) errors.push("Enter a valid BTC price.");
    if (!isFinite(marginCall) || marginCall <= 100) errors.push("Margin call must be above 100%.");
    if (!isFinite(liquidation) || liquidation <= 100) errors.push("Liquidation must be above 100%.");
    if (isFinite(marginCall) && isFinite(liquidation) && liquidation >= marginCall)
      errors.push("Liquidation threshold must be below the margin call threshold.");
    if (!startDateISO) errors.push("Pick a start date.");

    if (errors.length) {
      errEl.innerHTML = `<div class="notice danger">${errors.join("<br>")}</div>`;
      return;
    }

    const collateralSats = usdCentsToSats(collateralCents, priceCents);
    createLoan(
      {
        principalCents,
        annualRatePct: rate,
        termMonths: term,
        type,
        startDateISO,
        marginCallPct: marginCall,
        liquidationPct: liquidation,
      },
      collateralSats,
      priceCents
    );
  });
}
