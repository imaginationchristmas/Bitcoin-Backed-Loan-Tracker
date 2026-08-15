# Bitcoin-Backed Loan Tracker

A personal, browser-based calculator and tracker for a Bitcoin-backed loan between two people. No build step, no dependencies, no backend — your data stays in your browser.

## Run it

ES modules require a local server (opening `index.html` directly via `file://` won't work). From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

Any static server works — e.g. `npx serve` if you prefer Node.

## What it does

- **Setup** — enter loan terms (amount, rate, term, amortized or interest-only), collateral value, BTC price, and margin-call / liquidation thresholds. The BTC collateral amount is locked at the origination price.
- **Dashboard** — remaining balance, totals paid, interest paid/remaining, next payment, payoff quote, collateral value, ratio, and net equity position.
- **Payments** — log payments (interest-first waterfall, overpayment reduces principal), mark a scheduled payment missed with a note, and pay off the loan early at a quoted amount.
- **Collateral** — live BTC price (CoinGecko, with manual override), collateral ratio with a green/yellow/red health indicator, margin-call and liquidation trigger prices, and top-up / release calculators.
- **Simulator** — drag a slider to test any BTC price, and see how much interest you save paying off early.
- **Schedule** — the full month-by-month amortization table with paid / upcoming / missed highlighting.
- **Data** — export a JSON backup or a plain-text summary, import a backup, or erase everything.

## Conventions

- **Schedule-based interest**: the amortization table is the ledger. Late or missed payments are flagged but don't change scheduled interest.
- **Payment waterfall**: each payment covers scheduled interest first, then principal. Overpayment reduces principal and shortens the effective term.
- **Payoff quote**: remaining principal plus per-diem accrued interest for the current period. No prepayment penalty.
- All USD math is done in integer cents and BTC in satoshis, so the schedule stays penny-exact.

## Data

Everything is stored in `localStorage` under the key `btcLoanTracker.v1`. Clearing your browser data erases it — export a JSON backup after any change you care about.
