Here's the refined description with payment tracking and additional details:

---

**Bitcoin-Backed Loan Calculator & Tracker**

I want a web-based tool that serves as both a calculator and an ongoing tracker for a personal Bitcoin-backed loan between two friends. It should handle the initial setup, monthly payment tracking, collateral monitoring, and early payoff scenarios.

**Core Inputs (Initial Setup):**
- Loan amount in USD (e.g., $1,000)
- Annual interest rate (e.g., 5%)
- Loan term in months (e.g., 12)
- Collateral amount in USD (e.g., $2,000)
- Current Bitcoin price in USD (e.g., $62,000)
- Payment type: amortized (principal + interest) or interest-only
- Margin call threshold percentage (e.g., 150%)
- Liquidation threshold percentage (e.g., 120%)
- Loan start date

**Payment Tracking:**
- Log each payment made: date, amount, and whether it was interest-only or included principal
- Show running totals: total paid to date, total interest paid to date, total principal paid to date
- Display remaining balance in real time
- Show how many payments remain and the next payment due date
- Allow marking a payment as "missed" or "late" with a note

**Collateral Monitoring:**
- Current Bitcoin price input (updateable anytime)
- Current collateral value in USD (BTC amount × current price)
- Current collateral ratio (collateral value ÷ remaining loan balance)
- Visual health indicator: green (safe), yellow (approaching margin call), red (liquidation risk)
- Show exactly how much BTC would need to be added to restore a healthy ratio if price drops
- Show how much BTC could be released if price rises and you want to reduce collateral

**Scenario Simulator:**
- Slider or input to test "what if Bitcoin goes to $X?"
- See projected collateral ratio, margin call status, and liquidation risk at that price
- Test early payoff: input a month number or date to see remaining balance and interest saved
- Compare: what you'd pay if you finish the full term vs. paying off early

**Amortization Schedule:**
- Full month-by-month table: payment #, date, starting balance, interest, principal, total payment, ending balance
- Highlight which payments have been made vs. which are upcoming
- Show actual payment dates vs. scheduled dates if they differ

**Summary Dashboard:**
- Loan status: active, paid off, or in default
- Total interest paid so far
- Total interest remaining if you finish the term
- Projected total cost of the loan
- Current equity position: (collateral value - remaining balance) = your net position

**Data Persistence:**
- Save loan state locally (localStorage or similar) so you can close and return
- Export/import loan data as JSON for backup or sharing with the other party
- Optional: generate a simple text summary or PDF of the loan terms and payment history

**Design Notes:**
- Clean, minimal, editorial aesthetic
- Real-time updates as any input changes
- Mobile-friendly
- Dollar amounts formatted consistently ($X,XXX.XX)
- Bitcoin amounts shown in both BTC (8 decimal places) and USD
- Dates shown in a clear format (e.g., "Jan 15, 2025")

**Example Pre-fill:**
- Loan: $1,000 | Rate: 5% | Term: 12 months | Type: Amortized
- Collateral: $2,000 | BTC Price: $62,000 | BTC Posted: ~0.03226
- Margin call: 150% | Liquidation: 120%
- Monthly payment: $85.61 | Total interest: ~$27.32

---

You can paste this directly into another AI prompt.