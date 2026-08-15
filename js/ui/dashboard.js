// ui/dashboard.js — summary dashboard.

import { getState } from "../state.js";
import { computeLedger, payoffQuoteCents, scheduledInterestTotals } from "../loanMath.js";
import { collateralSnapshot, currentCollateralSats } from "../collateralMath.js";
import { fmtUsd, fmtBtc, fmtDate, fmtPct, todayISO } from "../format.js";

export function renderDashboard(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }
  const { loan, events, price } = s;
  const ledger = computeLedger(loan, events);
  const collateralSats = currentCollateralSats(loan, events);
  const snap = collateralSnapshot(loan, ledger.balanceCents, price.priceCents, collateralSats);
  const { totalScheduledInterestCents } = scheduledInterestTotals(loan);
  const payoff = payoffQuoteCents(loan, events, todayISO());

  const interestRemaining = Math.max(0, totalScheduledInterestCents - ledger.totalInterestCents);
  const projectedTotalCost = loan.principalCents + totalScheduledInterestCents;

  const statusBadge = ledger.paidOff
    ? `<span class="badge paidoff">Paid off</span>`
    : loan.status === "default"
      ? `<span class="badge default">In default</span>`
      : `<span class="badge active">Active</span>`;

  el.innerHTML = `
    <div class="card">
      <h2>Dashboard ${statusBadge}</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Remaining balance</div>
          <div class="stat-value">${fmtUsd(ledger.balanceCents)}</div>
          <div class="stat-sub">of ${fmtUsd(loan.principalCents)} borrowed</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total paid to date</div>
          <div class="stat-value">${fmtUsd(ledger.totalPaidCents)}</div>
          <div class="stat-sub">${ledger.paymentsMade} payment${ledger.paymentsMade === 1 ? "" : "s"}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Interest paid</div>
          <div class="stat-value">${fmtUsd(ledger.totalInterestCents)}</div>
          <div class="stat-sub">${fmtUsd(interestRemaining)} remaining on schedule</div>
        </div>
        <div class="stat">
          <div class="stat-label">Principal paid</div>
          <div class="stat-value">${fmtUsd(ledger.totalPrincipalCents)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Next payment</div>
          <div class="stat-value">${ledger.paidOff ? "—" : fmtUsd(ledger.nextPaymentCents)}</div>
          <div class="stat-sub">${ledger.paidOff ? "Loan complete" : "due " + fmtDate(ledger.nextDueDate)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Payoff today</div>
          <div class="stat-value">${fmtUsd(payoff.totalCents)}</div>
          <div class="stat-sub">incl. ${fmtUsd(payoff.accruedInterestCents)} accrued interest</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Position</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Collateral value</div>
          <div class="stat-value">${fmtUsd(snap.valueCents)}</div>
          <div class="stat-sub">${fmtBtc(collateralSats)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Collateral ratio</div>
          <div class="stat-value">${fmtPct(snap.ratio)}</div>
          <div class="stat-sub"><span class="health ${snap.band}">${snap.label}</span></div>
        </div>
        <div class="stat">
          <div class="stat-label">Net equity position</div>
          <div class="stat-value">${fmtUsd(snap.equityCents)}</div>
          <div class="stat-sub">collateral value − balance</div>
        </div>
        <div class="stat">
          <div class="stat-label">Projected total cost</div>
          <div class="stat-value">${fmtUsd(projectedTotalCost)}</div>
          <div class="stat-sub">principal + full-term interest</div>
        </div>
      </div>
      ${ledger.paidOff ? `<div class="notice info" style="margin-top:1rem">Loan is paid off. Collateral to return: <strong>${fmtBtc(collateralSats)}</strong>.</div>` : ""}
    </div>
  `;
}
