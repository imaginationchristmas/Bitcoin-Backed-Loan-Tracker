// ui/schedule.js — full amortization schedule with made/upcoming highlighting.

import { getState } from "../state.js";
import { computeLedger } from "../loanMath.js";
import { fmtUsd, fmtDate } from "../format.js";

export function renderSchedule(el) {
  const s = getState();
  if (!s || !s.loan) {
    el.innerHTML = "";
    return;
  }
  const { loan, events } = s;
  const ledger = computeLedger(loan, events);

  const rows = ledger.rows
    .map((r) => {
      const cls =
        r.isBalloon ? "row-balloon"
        : r.status === "made" ? "row-made"
        : r.status === "missed" ? "row-missed"
        : r === ledger.rows.find((x) => x.status === "upcoming" || x.status === "partial") ? "row-next"
        : "";
      const statusBadge =
        r.isBalloon ? `<span class="badge late">balloon</span>`
        : r.status === "made" && r.wasMissed ? `<span class="badge active">paid</span> <span class="badge missed">was missed</span>`
        : r.status === "made" ? `<span class="badge active">paid</span>`
        : r.status === "partial" ? `<span class="badge late">partial</span>`
        : r.status === "missed" ? `<span class="badge missed">missed</span>`
        : `<span class="muted small-text">upcoming</span>`;
      const actualCell =
        r.actualDate && r.actualDate !== r.date
          ? `${fmtDate(r.actualDate)} <span class="muted small-text">(sched. ${fmtDate(r.date)})</span>`
          : fmtDate(r.date);
      return `<tr class="${cls}">
        <td>${r.isBalloon ? "—" : r.n}</td>
        <td>${actualCell}</td>
        <td class="num">${fmtUsd(r.startBalanceCents)}</td>
        <td class="num">${fmtUsd(r.interestCents)}</td>
        <td class="num">${fmtUsd(r.principalCents)}</td>
        <td class="num">${fmtUsd(r.paymentCents)}</td>
        <td class="num">${fmtUsd(r.endBalanceCents)}</td>
        <td>${statusBadge}</td>
      </tr>`;
    })
    .join("");

  el.innerHTML = `
    <div class="card">
      <h2>Amortization schedule</h2>
      <p class="muted small-text">
        ${loan.type === "amortized"
          ? "Equal monthly payments of principal + interest. The final payment is adjusted for rounding."
          : "Monthly interest-only payments with the full principal due as a balloon at maturity."}
        Late or missed payments are flagged but do not change scheduled interest.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Date</th><th>Start balance</th><th>Interest</th>
              <th>Principal</th><th>Payment</th><th>End balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}
