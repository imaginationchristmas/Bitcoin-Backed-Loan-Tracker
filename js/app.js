// app.js — bootstrap, view routing, re-render orchestration.

import { loadState, getState, hasLoan, subscribe } from "./state.js";
import { fetchBtcPrice } from "./priceFeed.js";
import { renderSetup } from "./ui/setup.js";
import { renderDashboard } from "./ui/dashboard.js";
import { renderPayments } from "./ui/payments.js";
import { renderCollateral } from "./ui/collateral.js";
import { renderSimulator } from "./ui/simulator.js";
import { renderSchedule } from "./ui/schedule.js";
import { renderData } from "./ui/data.js";

const VIEWS = [
  { id: "view-dashboard", render: renderDashboard },
  { id: "view-payments", render: renderPayments },
  { id: "view-collateral", render: renderCollateral },
  { id: "view-simulator", render: renderSimulator },
  { id: "view-schedule", render: renderSchedule },
  { id: "view-data", render: renderData },
];

let activeViewId = "view-dashboard";

function renderAll() {
  const loanExists = hasLoan();
  const nav = document.getElementById("main-nav");
  nav.hidden = !loanExists;

  if (!loanExists) {
    // Only the setup view is relevant before a loan exists. Clear every other
    // view so no stale content lingers, and reset the active tab to the
    // dashboard for the next loan.
    for (const v of VIEWS) {
      document.getElementById(v.id).innerHTML = "";
    }
    activeViewId = "view-dashboard";
    showOnly("view-setup");
    renderSetup(document.getElementById("view-setup"));
    return;
  }

  // Render each view in a try/catch so one bad view can't leave the whole
  // app blank — the failing view shows the error instead.
  for (const v of VIEWS) {
    const el = document.getElementById(v.id);
    try {
      v.render(el);
    } catch (err) {
      console.error("Render failed for " + v.id + ":", err);
      el.innerHTML = `<div class="card"><div class="notice danger">This view failed to render: ${String(err && err.message || err)}</div></div>`;
    }
  }
  showOnly(activeViewId);
  highlightNav();
}

function showOnly(viewId) {
  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active", el.id === viewId);
  });
}

function highlightNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === activeViewId);
  });
}

function wireNav() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeViewId = btn.dataset.view;
      showOnly(activeViewId);
      highlightNav();
      window.scrollTo({ top: 0 });
    });
  });
}

// Boot
loadState();
wireNav();
subscribe(renderAll);
renderAll();

// Fetch a live price once on load if a loan exists (non-blocking).
if (hasLoan()) {
  fetchBtcPrice().catch(() => { /* fallback to last known price */ });
}
