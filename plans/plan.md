# Bitcoin-Backed Loan Calculator & Tracker — Implementation Plan

Source spec: `idea.md` (reviewed and extended in conversation).

## Locked Decisions

- **Stack**: Vanilla HTML/CSS/JS with ES modules, no build step. Open `index.html` and run.
- **Price feed**: CoinGecko `simple/price?ids=bitcoin&vs_currencies=usd` (free, no key), fetch on load + manual refresh, manual override always available, last-known price + timestamp shown on failure.
- **Loan**: Fresh loan, single loan at a time.
- **Interest convention**: Schedule-based — amortization table is the ledger; late/missed payments are flags, not recalculations.
- **Scope**: Single-user/local; JSON export/import retained for backup and future sharing.

## File Structure

```
index.html
css/styles.css
js/app.js            — bootstrap, pub/sub, re-render orchestration
js/loanMath.js       — pure: schedules, waterfall, payoff quote, rounding
js/collateralMath.js — pure: ratio, trigger prices, top-up/release, health bands
js/state.js          — loan + event log, localStorage, JSON export/import
js/priceFeed.js      — CoinGecko fetch, manual override, fallback
js/format.js         — $X,XXX.XX, BTC 8dp, "Jan 15, 2025" dates
js/ui/setup.js       — initial loan form (example pre-fill)
js/ui/dashboard.js   — status, totals, projected cost, equity, accrued interest
js/ui/payments.js    — log/miss/late payments, running totals, next due
js/ui/collateral.js  — price, ratio gauge, trigger prices, top-up/release calc
js/ui/simulator.js   — what-if price slider, early payoff comparison
js/ui/schedule.js    — amortization table, made vs upcoming, actual vs scheduled
js/ui/data.js        — export/import JSON, text summary export
plans/plan.md        — this file
```

## Data Model

```
Loan {
  principalCents, annualRatePct, termMonths,
  type: 'amortized' | 'interestOnly',
  startDateISO, marginCallPct, liquidationPct,
  collateralSats (locked at origination),
  originationPriceCents,
  status: 'active' | 'paidOff' | 'default'
}
EventLog [ { id, timestampISO, kind, data } ]
  kind: 'payment' | 'missedPayment' | 'priceUpdate'
      | 'collateralAdd' | 'collateralRelease' | 'note'
```

All derived values (balance, totals, ratio, trigger prices) are **computed from Loan + EventLog on every render** — never stored. Event log is append-only in the UI; corrections are new offsetting events.

## Money Math Rules

- All USD internally in integer cents; BTC in integer satoshis; format only at render.
- Monthly rate = annualRate / 12. Amortized payment = standard annuity formula.
- Payment waterfall: accrued interest first, then principal.
- Partial payments allowed; applied via same waterfall.
- Extra principal shortens the term (no recast).
- Final payment auto-adjusts for rounding (may differ by a cent).
- Interest-only: monthly interest rows + explicit principal balloon row at maturity.
- Payoff quote = remaining principal + interest accrued since last scheduled payment (per diem within current period). No prepayment penalty.
- Missed payments: flag + note only; schedule unchanged; status flips to 'default' at 30+ days past due (configurable later).

## Collateral Rules

- BTC collateral locked at origination: collateralSats = collateralUsd / originationPrice.
- Collateral ratio = current collateral USD value / remaining balance.
- Trigger prices (recomputed as balance amortizes):
  - marginCallPrice = balance × marginCallPct / collateralBtc
  - liquidationPrice = balance × liquidationPct / collateralBtc
  - Example at origination: ≈ $46,500 / ≈ $37,200
- Health bands: green ≥ marginCall + 10pp; yellow = marginCall..+10pp; red ≤ marginCall; dark-red ≤ liquidation.
- Top-up calculator targets: initial ratio (default) or marginCall + buffer.
- Release calculator: max BTC removable while staying ≥ initial ratio.
- Collateral add/release logged as dated events.
- At payoff: show "collateral to return: X BTC".

## UI Views

1. **Setup** — all core inputs, pre-filled with spec example ($1,000 / 5% / 12mo / amortized / $2,000 / $62,000 / 150% / 120%).
2. **Dashboard** — status, total paid, interest paid, principal paid, remaining balance, payments remaining, next due date, accrued interest to date, projected total cost, equity position (collateral value − balance).
3. **Payments** — log form (date, amount, type), missed/late with note, payment history list.
4. **Collateral** — current price (auto + manual override + timestamp), ratio gauge with health color, trigger prices, top-up/release calculators.
5. **Simulator** — what-if BTC price slider → projected ratio/status; early payoff by month/date → remaining balance, interest saved, full-term vs early comparison.
6. **Schedule** — full table (payment #, date, starting balance, interest, principal, total, ending balance), made vs upcoming highlighting, actual vs scheduled dates.
7. **Data** — export/import JSON, text summary export (doubles as term sheet).

## Design

- Clean, minimal, editorial aesthetic; mobile-responsive.
- USD: $X,XXX.XX. BTC: 8 decimals + USD equivalent. Dates: "Jan 15, 2025".
- Real-time recompute on any input change.

## Risks & Mitigations

- CoinGecko rate limit/downtime → fetch on load + manual refresh only; last-known price + timestamp; manual override.
- localStorage loss → one-click JSON export; backup nudge after logging a payment.
- Float errors → integer cents/sats internally.
- State drift → derived-not-stored balances; append-only log.

## Verification Targets

- Amortized: $85.61/mo, total interest $27.32, final payment rounding-adjusted.
- Interest-only: $4.17/mo, $1,000 balloon, $50 total interest.
- Trigger prices at origination: ≈ $46,500 (margin call), ≈ $37,200 (liquidation).
- Payoff quote = principal + per-diem accrual.
- Export → import round-trips to identical state.
