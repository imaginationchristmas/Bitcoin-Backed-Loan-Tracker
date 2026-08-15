// state.js — single source of truth: loan + append-only event log.
// Persists to localStorage; supports JSON export/import.

const STORAGE_KEY = "btcLoanTracker.v1";

let state = null; // { loan, events, price: {priceCents, updatedISO, manual} }
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Failed to persist state:", e);
  }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.loan) {
        state = parsed;
        return state;
      }
    }
  } catch (e) {
    console.error("Failed to load state:", e);
  }
  state = null;
  return null;
}

export function getState() {
  return state;
}

export function hasLoan() {
  return !!(state && state.loan);
}

/**
 * Create a new loan. `loanInput` uses UI-friendly values already converted
 * to cents/sats by the caller. Locks collateral BTC at the origination price.
 */
export function createLoan(loanInput, collateralSats, originationPriceCents) {
  state = {
    loan: {
      ...loanInput,
      collateralSats,
      originationPriceCents,
      status: "active",
      createdISO: new Date().toISOString(),
    },
    events: [
      {
        id: genId(),
        timestampISO: new Date().toISOString(),
        kind: "priceUpdate",
        data: { priceCents: originationPriceCents, source: "origination" },
      },
    ],
    price: {
      priceCents: originationPriceCents,
      updatedISO: new Date().toISOString(),
      manual: false,
    },
  };
  persist();
  emit();
}

/** Append an event to the log (append-only; no edits or deletes). */
export function addEvent(kind, data) {
  if (!state) return;
  state.events.push({
    id: genId(),
    timestampISO: new Date().toISOString(),
    kind,
    data,
  });
  // Keep loan.status in sync for paid-off detection.
  if (kind === "statusChange" && data.status) {
    state.loan.status = data.status;
  }
  persist();
  emit();
}

/** Update the current BTC price. source: 'auto' | 'manual' */
export function setPrice(priceCents, source) {
  if (!state) return;
  state.price = {
    priceCents,
    updatedISO: new Date().toISOString(),
    manual: source === "manual",
  };
  state.events.push({
    id: genId(),
    timestampISO: new Date().toISOString(),
    kind: "priceUpdate",
    data: { priceCents, source },
  });
  persist();
  emit();
}

/** Export the full state as a JSON string. */
export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

/**
 * Import state from a JSON string. Returns { ok, error }.
 * Validates the minimal schema before replacing current state.
 */
export function importJSON(jsonStr) {
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, error: "Not valid JSON." };
  }
  const err = validateState(parsed);
  if (err) return { ok: false, error: err };
  state = parsed;
  persist();
  emit();
  return { ok: true };
}

function validateState(s) {
  if (!s || typeof s !== "object") return "Not an object.";
  if (!s.loan || typeof s.loan !== "object") return "Missing loan.";
  const l = s.loan;
  if (typeof l.principalCents !== "number" || l.principalCents <= 0) return "Invalid principal.";
  if (typeof l.annualRatePct !== "number" || l.annualRatePct < 0) return "Invalid rate.";
  if (typeof l.termMonths !== "number" || l.termMonths <= 0) return "Invalid term.";
  if (l.type !== "amortized" && l.type !== "interestOnly") return "Invalid loan type.";
  if (typeof l.collateralSats !== "number" || l.collateralSats < 0) return "Invalid collateral.";
  if (!Array.isArray(s.events)) return "Missing event log.";
  if (!s.price || typeof s.price.priceCents !== "number") return "Missing price.";
  return null;
}

/** Reset everything (with confirmation handled by the UI). */
export function resetAll() {
  state = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) { /* ignore */ }
  emit();
}

function genId() {
  return "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
