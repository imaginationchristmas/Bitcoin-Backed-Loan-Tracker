// ui/payments.js — log payments, mark missed/late, view history.

import { getState, addEvent } from "../state.js";
import { computeLedger, payoffQuoteCents } from "../loanMath.js";
import { fmtUsd, fmtDate, fmtDateTime, parseUsdToCents, todayISO } from "../format.js";

export function renderPayments(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }
  const { loan, events } = s;
  const ledger = computeLedger(loan, events);

  const paymentEvents = events
    .filter((e) => e.kind === "payment" || e.kind === "missedPayment")
    .slice()
    .sort((a, b) => b.timestampISO.localeCompare(a.timestampISO));

  const historyRows = paymentEvents
    .map((e) => {
      if (e.kind === "payment") {
        return `<tr>
          <td>${fmtDate(e.data.date)}</td>
          <td class="num">${fmtUsd(e.data.amountCents)}</td>
          <td><span class="badge active">payment</span></td>
          <td class="muted small-text">${escapeHtml(e.data.note || "")}</td>
        </tr>`;
      }
      return `<tr>
        <td>${fmtDate(e.data.scheduledDate)}</td>
        <td class="num">—</td>
        <td><span class="badge missed">missed</span></td>
        <td class="muted small-text">${escapeHtml(e.data.note || "")}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <div class="card">
      <h2>Log a payment</h2>
      ${ledger.paidOff ? `<div class="notice info">Loan is paid off — no further payments due.</div>` : ""}
      <div class="form-grid">
        <div class="field">
          <label for="p-date">Date</label>
          <input id="p-date" type="date" value="${todayISO()}">
        </div>
        <div class="field">
          <label for="p-amount">Amount (USD)</label>
          <input id="p-amount" type="text" inputmode="decimal" placeholder="${(ledger.nextPaymentCents / 100).toFixed(2)}">
          <div class="hint">Scheduled: ${fmtUsd(ledger.nextPaymentCents)} — overpayment reduces principal</div>
        </div>
        <div class="field">
          <label for="p-note">Note (optional)</label>
          <input id="p-note" type="text" placeholder="e.g. paid via Venmo">
        </div>
      </div>
      <div id="p-error"></div>
      <div class="btn-row">
        <button class="btn" id="btn-log" ${ledger.paidOff ? "disabled" : ""}>Log payment</button>
        <button class="btn secondary" id="btn-payoff" ${ledger.paidOff ? "disabled" : ""}>Pay off loan</button>
        <button class="btn secondary" id="btn-missed" ${ledger.paidOff ? "disabled" : ""}>Mark scheduled payment missed</button>
      </div>
      <p class="muted small-text" id="payoff-hint"></p>
    </div>

    <div class="card">
      <h2>Running totals</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Total paid</div>
          <div class="stat-value">${fmtUsd(ledger.totalPaidCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Interest paid</div>
          <div class="stat-value">${fmtUsd(ledger.totalInterestCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Principal paid</div>
          <div class="stat-value">${fmtUsd(ledger.totalPrincipalCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Remaining balance</div>
          <div class="stat-value">${fmtUsd(ledger.balanceCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Next due</div>
          <div class="stat-value">${ledger.paidOff ? "—" : fmtDate(ledger.nextDueDate)}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Payment history</h2>
      ${historyRows
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Amount</th><th>Type</th><th>Note</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table></div>`
        : `<p class="muted small-text">No payments logged yet.</p>`}
    </div>
  `;

  const $ = (id) => el.querySelector(id);

  $("#btn-log").addEventListener("click", () => {
    const date = $("#p-date").value;
    const amountCents = parseUsdToCents($("#p-amount").value);
    const note = $("#p-note").value.trim();
    const errEl = $("#p-error");
    if (!date) {
      errEl.innerHTML = `<div class="notice danger">Pick a payment date.</div>`;
      return;
    }
    if (!amountCents || amountCents <= 0) {
      errEl.innerHTML = `<div class="notice danger">Enter a valid amount.</div>`;
      return;
    }
    addEvent("payment", { date, amountCents, note });
  });

  $("#btn-missed").addEventListener("click", () => {
    if (!ledger.nextDueDate) return;
    const note = $("#p-note").value.trim();
    addEvent("missedPayment", { scheduledDate: ledger.nextDueDate, note });
  });

  // Payoff: log an isPayoff payment at the quoted amount for the chosen date.
  const payoffHint = $("#payoff-hint");
  if (!ledger.paidOff) {
    const date = $("#p-date").value || todayISO();
    const q = payoffQuoteCents(loan, events, date);
    payoffHint.textContent =
      `Payoff quote for ${fmtDate(date)}: ${fmtUsd(q.totalCents)} ` +
      `(${fmtUsd(q.principalCents)} principal + ${fmtUsd(q.accruedInterestCents)} accrued interest).`;
  }

  $("#p-date").addEventListener("change", () => {
    if (ledger.paidOff) return;
    const date = $("#p-date").value || todayISO();
    const q = payoffQuoteCents(loan, events, date);
    payoffHint.textContent =
      `Payoff quote for ${fmtDate(date)}: ${fmtUsd(q.totalCents)} ` +
      `(${fmtUsd(q.principalCents)} principal + ${fmtUsd(q.accruedInterestCents)} accrued interest).`;
  });

  $("#btn-payoff").addEventListener("click", () => {
    const date = $("#p-date").value || todayISO();
    const note = $("#p-note").value.trim();
    const q = payoffQuoteCents(loan, events, date);
    if (q.totalCents <= 0) return;
    if (!confirm(`Log a payoff of ${fmtUsd(q.totalCents)} on ${fmtDate(date)}? This marks the loan paid off.`)) return;
    addEvent("payment", { date, amountCents: q.totalCents, note: note || "Payoff", isPayoff: true });
  });
}

// Escape user text for safe insertion into innerHTML. Uses the DOM so we
// never hand-write HTML entities.
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}
