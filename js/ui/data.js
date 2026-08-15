// ui/data.js — export/import JSON, text summary, reset.

import { getState, exportJSON, importJSON, resetAll } from "../state.js";
import { computeLedger, scheduledInterestTotals } from "../loanMath.js";
import { collateralSnapshot, currentCollateralSats } from "../collateralMath.js";
import { fmtUsd, fmtBtc, fmtDate, fmtPct } from "../format.js";

export function renderData(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `
    <div class="card">
      <h2>Backup & restore</h2>
      <p class="muted small-text">
        Your data lives only in this browser. Export JSON after any change you
        care about — clearing browser data will erase it.
      </p>
      <div class="btn-row">
        <button class="btn" id="btn-export">Download JSON backup</button>
        <button class="btn secondary" id="btn-summary">Download text summary</button>
      </div>
      <h3>Import</h3>
      <div class="field">
        <label for="import-file">Restore from a JSON backup (replaces current data)</label>
        <input id="import-file" type="file" accept="application/json,.json">
      </div>
      <div id="import-msg"></div>
    </div>

    <div class="card">
      <h2>Danger zone</h2>
      <p class="muted small-text">Erase the loan and all history from this browser. Export first if you want a record.</p>
      <button class="btn danger" id="btn-reset">Erase everything</button>
    </div>
  `;

  const $ = (id) => el.querySelector(id);

  $("#btn-export").addEventListener("click", () => {
    download("btc-loan-backup.json", exportJSON(), "application/json");
  });

  $("#btn-summary").addEventListener("click", () => {
    download("btc-loan-summary.txt", buildTextSummary(s), "text/plain");
  });

  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importJSON(String(reader.result));
      const msg = $("#import-msg");
      if (!res.ok) {
        msg.innerHTML = `<div class="notice danger">Import failed: ${res.error}</div>`;
      }
      // On success, state change triggers re-render automatically.
    };
    reader.readAsText(file);
  });

  $("#btn-reset").addEventListener("click", () => {
    if (confirm("Erase the loan and all history from this browser? This cannot be undone.")) {
      resetAll();
    }
  });
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildTextSummary(s) {
  const { loan, events, price } = s;
  const ledger = computeLedger(loan, events);
  const collateralSats = currentCollateralSats(loan, events);
  const snap = collateralSnapshot(loan, ledger.balanceCents, price.priceCents, collateralSats);
  const { totalScheduledInterestCents } = scheduledInterestTotals(loan);

  const lines = [];
  lines.push("BITCOIN-BACKED LOAN SUMMARY");
  lines.push("Generated: " + new Date().toLocaleString());
  lines.push("");
  lines.push("TERMS");
  lines.push(`  Principal:        ${fmtUsd(loan.principalCents)}`);
  lines.push(`  Annual rate:      ${loan.annualRatePct}%`);
  lines.push(`  Term:             ${loan.termMonths} months`);
  lines.push(`  Type:             ${loan.type === "amortized" ? "Amortized" : "Interest-only"}`);
  lines.push(`  Start date:       ${fmtDate(loan.startDateISO)}`);
  lines.push(`  Margin call:      ${loan.marginCallPct}%`);
  lines.push(`  Liquidation:      ${loan.liquidationPct}%`);
  lines.push("");
  lines.push("COLLATERAL");
  lines.push(`  BTC posted:       ${fmtBtc(collateralSats)}`);
  lines.push(`  Locked at price:  ${fmtUsd(loan.originationPriceCents)}/BTC`);
  lines.push(`  Current price:    ${fmtUsd(price.priceCents)}/BTC`);
  lines.push(`  Current value:    ${fmtUsd(snap.valueCents)}`);
  lines.push(`  Current ratio:    ${fmtPct(snap.ratio)} (${snap.label})`);
  lines.push("");
  lines.push("STATUS");
  lines.push(`  Remaining balance: ${fmtUsd(ledger.balanceCents)}`);
  lines.push(`  Total paid:        ${fmtUsd(ledger.totalPaidCents)}`);
  lines.push(`  Interest paid:     ${fmtUsd(ledger.totalInterestCents)}`);
  lines.push(`  Principal paid:    ${fmtUsd(ledger.totalPrincipalCents)}`);
  lines.push(`  Full-term interest (scheduled): ${fmtUsd(totalScheduledInterestCents)}`);
  lines.push("");
  lines.push("PAYMENT HISTORY");
  const payments = events.filter((e) => e.kind === "payment" || e.kind === "missedPayment");
  if (!payments.length) {
    lines.push("  (none)");
  } else {
    for (const e of payments) {
      if (e.kind === "payment") {
        lines.push(`  ${fmtDate(e.data.date)}  ${fmtUsd(e.data.amountCents)}${e.data.note ? "  — " + e.data.note : ""}`);
      } else {
        lines.push(`  ${fmtDate(e.data.scheduledDate)}  MISSED${e.data.note ? "  — " + e.data.note : ""}`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
