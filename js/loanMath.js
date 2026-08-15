// loanMath.js — pure loan calculations. No DOM, no state.
// All USD values are integer cents. Dates are YYYY-MM-DD strings.

import { addMonths, daysBetween } from "./format.js";

/**
 * Monthly interest rate as a decimal (e.g. 5% APR -> 0.05/12).
 */
export function monthlyRate(annualRatePct) {
  return annualRatePct / 100 / 12;
}

/**
 * Amortized monthly payment in cents (standard annuity formula).
 * Final payment is adjusted for rounding inside buildSchedule().
 */
export function amortizedPaymentCents(principalCents, annualRatePct, termMonths) {
  const r = monthlyRate(annualRatePct);
  if (r === 0) return Math.round(principalCents / termMonths);
  // Work in float for the formula, round once at the end.
  const p = principalCents / 100;
  const payment = (p * r) / (1 - Math.pow(1 + r, -termMonths));
  return Math.round(payment * 100);
}

/**
 * Build the full scheduled amortization table.
 *
 * Returns an array of rows:
 * {
 *   n, date, startBalanceCents, interestCents, principalCents,
 *   paymentCents, endBalanceCents, isBalloon
 * }
 *
 * - Amortized: `termMonths` equal payments; the final row is adjusted so the
 *   balance lands exactly on zero (may differ by a cent).
 * - Interest-only: `termMonths` interest-only rows, then a final balloon row
 *   returning the full principal.
 */
export function buildSchedule(loan) {
  const { principalCents, annualRatePct, termMonths, type, startDateISO } = loan;
  const r = monthlyRate(annualRatePct);
  const rows = [];

  if (type === "interestOnly") {
    const interest = Math.round((principalCents / 100) * r * 100);
    for (let n = 1; n <= termMonths; n++) {
      rows.push({
        n,
        date: addMonths(startDateISO, n),
        startBalanceCents: principalCents,
        interestCents: interest,
        principalCents: 0,
        paymentCents: interest,
        endBalanceCents: principalCents,
        isBalloon: false,
      });
    }
    rows.push({
      n: termMonths + 1,
      date: addMonths(startDateISO, termMonths),
      startBalanceCents: principalCents,
      interestCents: 0,
      principalCents: principalCents,
      paymentCents: principalCents,
      endBalanceCents: 0,
      isBalloon: true,
    });
    return rows;
  }

  // Amortized
  const payment = amortizedPaymentCents(principalCents, annualRatePct, termMonths);
  let balance = principalCents;
  for (let n = 1; n <= termMonths; n++) {
    const interest = Math.round((balance / 100) * r * 100);
    let principalPaid = payment - interest;
    let thisPayment = payment;
    // Final row: adjust so the balance lands exactly on zero.
    if (n === termMonths || principalPaid >= balance) {
      principalPaid = balance;
      thisPayment = balance + interest;
    }
    const end = balance - principalPaid;
    rows.push({
      n,
      date: addMonths(startDateISO, n),
      startBalanceCents: balance,
      interestCents: interest,
      principalCents: principalPaid,
      paymentCents: thisPayment,
      endBalanceCents: end,
      isBalloon: false,
    });
    balance = end;
  }
  return rows;
}

/**
 * Apply actual payment events to the schedule and compute the current ledger.
 *
 * Payment waterfall: each payment covers scheduled interest due first, then
 * principal. Overpayment reduces principal (shortens effective term).
 * Schedule-based convention: late/missed payments do NOT change interest.
 *
 * @param loan   the loan object
 * @param events full event log (only kind==='payment' entries are used)
 * @returns {
 *   rows,                // schedule rows annotated with status:
 *                        //   status: 'made'|'partial'|'missed'|'upcoming'
 *                        //   paidCents, actualDate, note
 *   balanceCents,        // current remaining principal
 *   totalPaidCents,
 *   totalInterestCents,
 *   totalPrincipalCents,
 *   paymentsMade,        // count of payment events
 *   nextDueDate,         // first unpaid scheduled date (null if paid off)
 *   nextPaymentCents,    // scheduled amount of next unpaid row
 *   paidOff
 * }
 */
/**
 * Per-diem accrued interest for the period containing `row`, from the period's
 * start date to `asOfDateISO`, on the given balance. Used by the payoff path.
 */
function accruedInterestForRow(loan, schedule, row, balanceCents, asOfDateISO) {
  const r = monthlyRate(loan.annualRatePct);
  // Period start = previous row's date, or the loan start for the first row.
  const idx = schedule.indexOf(row);
  const periodStart = idx > 0 ? schedule[idx - 1].date : loan.startDateISO;
  const periodEnd = row.date;
  const periodDays = Math.max(1, daysBetween(periodStart, periodEnd));
  const elapsedDays = Math.min(Math.max(0, daysBetween(periodStart, asOfDateISO)), periodDays);
  const fullPeriodInterest = Math.round((balanceCents / 100) * r * 100);
  return Math.round(fullPeriodInterest * (elapsedDays / periodDays));
}

export function computeLedger(loan, events) {
  const schedule = buildSchedule(loan);
  const payments = events
    .filter((e) => e.kind === "payment")
    .sort((a, b) => a.data.date.localeCompare(b.data.date) || a.timestampISO.localeCompare(b.timestampISO));
  const missed = events.filter((e) => e.kind === "missedPayment");

  // Walk the schedule, applying payments in date order via the waterfall.
  let balance = loan.principalCents;
  let totalPaid = 0;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let pi = 0; // index into payments
  let paidOffFlag = false;

  const rows = schedule.map((row) => {
    const interestDue = row.interestCents;
    let interestPaid = 0;
    let principalPaid = 0;
    let paidCents = 0;
    let actualDate = null;
    let note = null;

    // Consume payment events while this row still has scheduled amounts due.
    while (pi < payments.length && (interestPaid < interestDue || principalPaid < row.principalCents)) {
      const pmt = payments[pi];
      let amt = pmt.data.amountCents;
      if (!actualDate) {
        actualDate = pmt.data.date;
        note = pmt.data.note || null;
      }

      // Payoff path: a payment flagged isPayoff clears the loan. It covers
      // accrued interest to its date (per-diem within this period) plus the
      // full remaining principal. This is distinct from a scheduled payment.
      if (pmt.data.isPayoff) {
        const remainingBalance = balance - principalPaid;
        const accrued = accruedInterestForRow(loan, schedule, row, balance - principalPaid, pmt.data.date);
        const interestPart = Math.min(amt, accrued);
        const principalPart = Math.min(amt - interestPart, remainingBalance);
        interestPaid += interestPart;
        principalPaid += principalPart;
        paidCents += interestPart + principalPart;
        // Excess beyond payoff is counted as paid but doesn't go negative.
        const leftover = amt - interestPart - principalPart;
        if (leftover > 0) paidCents += leftover;
        pi++;
        if (principalPaid >= remainingBalance) paidOffFlag = true;
        break;
      }

      // Interest first
      const interestStillDue = interestDue - interestPaid;
      const toInterest = Math.min(amt, interestStillDue);
      interestPaid += toInterest;
      amt -= toInterest;
      // Then scheduled principal
      const toPrincipal = Math.min(amt, row.principalCents - principalPaid);
      principalPaid += toPrincipal;
      amt -= toPrincipal;
      paidCents += toInterest + toPrincipal;

      // Overpayment spills to principal beyond this row, capped at the
      // actual remaining balance so a large payment pays the loan down.
      if (amt > 0) {
        const remaining = balance - principalPaid;
        const extra = Math.min(amt, Math.max(0, remaining));
        principalPaid += extra;
        paidCents += extra;
        amt -= extra;
      }
      if (amt > 0) {
        paidCents += amt;
        amt = 0;
      }
      pi++;
    }

    balance = Math.max(0, balance - principalPaid);
    totalPaid += paidCents;
    totalInterest += interestPaid;
    totalPrincipal += principalPaid;

    let status = "upcoming";
    if (paidCents >= row.paymentCents && row.paymentCents > 0) status = "made";
    else if (paidCents > 0) status = "partial";
    if (paidOffFlag && balance <= 0) status = "made";

    return { ...row, status, paidCents, actualDate, note };
  });

  // Any remaining payments beyond the schedule (pure extra principal).
  while (pi < payments.length) {
    const amt = payments[pi].data.amountCents;
    const applied = Math.min(amt, balance);
    balance = Math.max(0, balance - applied);
    totalPaid += amt;
    totalPrincipal += applied;
    pi++;
  }

  // Mark missed rows: a missedPayment event references a scheduled date.
  // The flag persists as history (wasMissed) even if the row is later paid.
  for (const m of missed) {
    const row = rows.find((r) => r.date === m.data.scheduledDate);
    if (row) {
      row.wasMissed = true;
      if (m.data.note) row.note = m.data.note;
      if (row.status !== "made") row.status = "missed";
    }
  }

  const paidOff = balance <= 0;
  const nextRow = rows.find((r) => r.status === "upcoming" || r.status === "partial" || r.status === "missed");

  return {
    rows,
    balanceCents: balance,
    totalPaidCents: totalPaid,
    totalInterestCents: totalInterest,
    totalPrincipalCents: totalPrincipal,
    paymentsMade: payments.length,
    nextDueDate: paidOff ? null : nextRow ? nextRow.date : null,
    nextPaymentCents: paidOff ? 0 : nextRow ? nextRow.paymentCents : 0,
    paidOff,
  };
}

/**
 * Payoff quote in cents as of a given date:
 * remaining principal + per-diem interest accrued since the last scheduled
 * payment date (within the current period). No prepayment penalty.
 */
export function payoffQuoteCents(loan, events, asOfDateISO) {
  const ledger = computeLedger(loan, events);
  if (ledger.paidOff) return { totalCents: 0, principalCents: 0, accruedInterestCents: 0 };

  // The current period is the first unpaid row. Accrued interest runs from
  // that row's period start to the payoff date. On the due date itself the
  // full period has elapsed, so accrued equals the row's scheduled interest.
  const currentRow = ledger.rows.find((row) => row.status === "upcoming" || row.status === "partial" || row.status === "missed");
  if (!currentRow) {
    return { totalCents: ledger.balanceCents, principalCents: ledger.balanceCents, accruedInterestCents: 0 };
  }
  const accrued = accruedInterestForRow(loan, buildSchedule(loan), currentRow, ledger.balanceCents, asOfDateISO);

  return {
    totalCents: ledger.balanceCents + accrued,
    principalCents: ledger.balanceCents,
    accruedInterestCents: accrued,
  };
}

/**
 * Interest totals for the summary dashboard.
 * totalScheduledInterestCents: full-term interest if paid exactly on schedule.
 */
export function scheduledInterestTotals(loan) {
  const rows = buildSchedule(loan);
  const total = rows.reduce((s, r) => s + r.interestCents, 0);
  return { totalScheduledInterestCents: total };
}

/**
 * Early payoff comparison: pay off after `payoffMonth` scheduled payments.
 * Returns { interestPaidCents, interestSavedCents, payoffAmountCents }.
 */
export function earlyPayoffComparison(loan, payoffMonth) {
  const rows = buildSchedule(loan);
  const totalInterest = rows.reduce((s, r) => s + r.interestCents, 0);
  const clamped = Math.max(1, Math.min(payoffMonth, loan.termMonths));
  const paidRows = rows.slice(0, clamped);
  const interestPaid = paidRows.reduce((s, r) => s + r.interestCents, 0);
  const balanceAfter = paidRows.length ? paidRows[paidRows.length - 1].endBalanceCents : loan.principalCents;
  return {
    interestPaidCents: interestPaid,
    interestSavedCents: Math.max(0, totalInterest - interestPaid),
    payoffAmountCents: balanceAfter,
    totalScheduledInterestCents: totalInterest,
  };
}
