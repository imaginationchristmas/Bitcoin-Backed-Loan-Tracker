// ui/collateral.js — collateral monitoring: price, ratio gauge, trigger
// prices, top-up / release calculators, and Add/Release collateral forms
// wired into the append-only event log.

import { getState, setPrice, addEvent } from "../state.js";
import { fetchBtcPrice } from "../priceFeed.js";
import { computeLedger } from "../loanMath.js";
import { collateralSnapshot, currentCollateralSats } from "../collateralMath.js";
import { fmtUsd, fmtBtc, fmtPct, fmtDate, fmtDateTime, parseUsdToCents, parseBtcToSats, todayISO } from "../format.js";

export function renderCollateral(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }
  const { loan, events, price } = s;
  const ledger = computeLedger(loan, events);
  const collateralSats = currentCollateralSats(loan, events);
  const snap = collateralSnapshot(loan, ledger.balanceCents, price.priceCents, collateralSats);

  const barPct = isFinite(snap.ratio)
    ? Math.min(100, (snap.ratio / (snap.initialRatioPct / 100)) * 100)
    : 100;

  const movements = events.filter((e) => e.kind === "collateralAdd" || e.kind === "collateralRelease");

  el.innerHTML = `
    <div class="card">
      <h2>Bitcoin price</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Current price</div>
          <div class="stat-value">${fmtUsd(price.priceCents)}</div>
          <div class="stat-sub">
            ${price.manual ? "manual override" : "auto"} · updated ${fmtDateTime(price.updatedISO)}
          </div>
        </div>
      </div>
      <div class="form-grid" style="margin-top:0.9rem">
        <div class="field">
          <label for="c-price">Update price manually (USD)</label>
          <input id="c-price" type="text" inputmode="decimal" placeholder="${(price.priceCents / 100).toFixed(2)}">
        </div>
      </div>
      <div id="c-msg"></div>
      <div class="btn-row">
        <button class="btn secondary" id="btn-set-price">Set manual price</button>
        <button class="btn secondary" id="btn-fetch-price">Fetch live price</button>
      </div>
    </div>

    <div class="card">
      <h2>Collateral health</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Collateral posted</div>
          <div class="stat-value">${fmtBtc(collateralSats)}</div>
          <div class="stat-sub">locked at ${fmtUsd(loan.originationPriceCents)}/BTC</div>
        </div>
        <div class="stat">
          <div class="stat-label">Current value</div>
          <div class="stat-value">${fmtUsd(snap.valueCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Collateral ratio</div>
          <div class="stat-value">${fmtPct(snap.ratio)}</div>
        </div>
      </div>
      <div class="ratio-bar"><div class="fill ${snap.band}" style="width:${barPct}%"></div></div>
      <p><span class="health ${snap.band}">${snap.label}</span></p>
      <div class="stat-grid" style="margin-top:0.9rem">
        <div class="stat">
          <div class="stat-label">Margin call at (${loan.marginCallPct}%)</div>
          <div class="stat-value">${fmtUsd(snap.marginCallPriceCents)}</div>
          <div class="stat-sub">BTC price trigger</div>
        </div>
        <div class="stat">
          <div class="stat-label">Liquidation at (${loan.liquidationPct}%)</div>
          <div class="stat-value">${fmtUsd(snap.liquidationPriceCents)}</div>
          <div class="stat-sub">BTC price trigger</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Adjust collateral</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Add to restore ${fmtPct(snap.initialRatioPct / 100, 0)}</div>
          <div class="stat-value">${snap.topUpToInitialSats > 0 ? fmtBtc(snap.topUpToInitialSats) : "—"}</div>
          <div class="stat-sub">${snap.topUpToInitialSats > 0 ? "≈ " + fmtUsd(Math.round(snap.topUpToInitialSats / 1e8 * price.priceCents)) : "already at target"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Add to clear margin call</div>
          <div class="stat-value">${snap.topUpToMarginBufferSats > 0 ? fmtBtc(snap.topUpToMarginBufferSats) : "—"}</div>
          <div class="stat-sub">${snap.topUpToMarginBufferSats > 0 ? "back above " + loan.marginCallPct + "% + buffer" : "not needed"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Releasable excess</div>
          <div class="stat-value">${snap.releasableAtInitialSats > 0 ? fmtBtc(snap.releasableAtInitialSats) : "—"}</div>
          <div class="stat-sub">${snap.releasableAtInitialSats > 0 ? "while staying at " + fmtPct(snap.initialRatioPct / 100, 0) : "none available"}</div>
        </div>
      </div>

      <h3 style="margin-top:1.2rem">Record a collateral movement</h3>
      <p class="muted small-text">
        When you actually send more BTC to your friend (or they send some back),
        record it here so the posted amount above stays accurate.
      </p>
      <div class="form-grid">
        <div class="field">
          <label for="cm-amount">Amount (BTC)</label>
          <input id="cm-amount" type="text" inputmode="decimal" placeholder="0.005">
        </div>
        <div class="field">
          <label for="cm-date">Date</label>
          <input id="cm-date" type="date" value="${todayISO()}">
        </div>
        <div class="field">
          <label for="cm-note">Note (optional)</label>
          <input id="cm-note" type="text" placeholder="e.g. margin call top-up">
        </div>
      </div>
      <div id="cm-msg"></div>
      <div class="btn-row">
        <button class="btn" id="btn-add-collateral">Add collateral</button>
        <button class="btn secondary" id="btn-release-collateral">Release collateral</button>
      </div>

      ${movements.length ? `
        <h3 style="margin-top:1.2rem">Movement history</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Movement</th><th>Note</th></tr></thead>
          <tbody>
            ${movements.map((e) => `
              <tr>
                <td>${fmtDate(e.data.date)}</td>
                <td>${e.kind === "collateralAdd" ? "+" : "−"}${fmtBtc(e.data.sats)}</td>
                <td>${e.data.note ? escapeHtml(e.data.note) : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table></div>
      ` : ""}
    </div>
  `;

  const $ = (id) => el.querySelector(id);

  $("#btn-set-price").addEventListener("click", () => {
    const cents = parseUsdToCents($("#c-price").value);
    const msg = $("#c-msg");
    if (!cents || cents <= 0) {
      msg.innerHTML = `<div class="notice danger">Enter a valid price.</div>`;
      return;
    }
    setPrice(cents, "manual");
  });

  $("#btn-fetch-price").addEventListener("click", async () => {
    const btn = $("#btn-fetch-price");
    btn.disabled = true;
    btn.textContent = "Fetching…";
    const res = await fetchBtcPrice();
    if (!res.ok) {
      $("#c-msg").innerHTML = `<div class="notice warn">${res.error}</div>`;
      btn.disabled = false;
      btn.textContent = "Fetch live price";
    }
    // On success, state change triggers a re-render automatically.
  });

  $("#btn-add-collateral").addEventListener("click", () => {
    const sats = parseBtcToSats($("#cm-amount").value);
    const date = $("#cm-date").value || todayISO();
    const note = $("#cm-note").value.trim();
    const msg = $("#cm-msg");
    if (!sats || sats <= 0) {
      msg.innerHTML = `<div class="notice danger">Enter a valid BTC amount to add.</div>`;
      return;
    }
    addEvent("collateralAdd", { sats, date, note });
  });

  $("#btn-release-collateral").addEventListener("click", () => {
    const sats = parseBtcToSats($("#cm-amount").value);
    const date = $("#cm-date").value || todayISO();
    const note = $("#cm-note").value.trim();
    const msg = $("#cm-msg");
    if (!sats || sats <= 0) {
      msg.innerHTML = `<div class="notice danger">Enter a valid BTC amount to release.</div>`;
      return;
    }
    if (sats > collateralSats) {
      msg.innerHTML = `<div class="notice danger">Can't release ${fmtBtc(sats)} — only ${fmtBtc(collateralSats)} is currently posted.</div>`;
      return;
    }
    if (snap.releasableAtInitialSats > 0 && sats > snap.releasableAtInitialSats) {
      if (!confirm(`Releasing ${fmtBtc(sats)} would drop the ratio below the ${fmtPct(snap.initialRatioPct / 100, 0)} target (releasable excess is ${fmtBtc(snap.releasableAtInitialSats)}). Record it anyway?`)) {
        return;
      }
    }
    addEvent("collateralRelease", { sats, date, note });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
