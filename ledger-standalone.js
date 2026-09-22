(() => {
  "use strict";

  const ROOT = "#ledger-root";
  const TRIP_ID = "italy-2026-10";

  async function openLedger() {
    if (!window.TravelLedger) {
      console.error("TravelLedger failed to load.");
      return;
    }
    await window.TravelLedger.init({
      root: ROOT,
      tripId: TRIP_ID,
      configUrl: false,
      persistenceMode: "local"
    });
    if (location.hash === "#ledger-stats") {
      window.TravelLedger.setActiveTab("stats", { updateHash: false, forceRender: true });
    }
  }

  window.addEventListener("travel-ledger:navigate", (event) => {
    const tab = event.detail?.tab === "stats" ? "stats" : "entry";
    const nextHash = tab === "stats" ? "#ledger-stats" : "#ledger";
    if (location.hash !== nextHash) history.replaceState(null, "", nextHash);
  });

  window.addEventListener("hashchange", () => {
    if (!window.TravelLedger) return;
    window.TravelLedger.setActiveTab(
      location.hash === "#ledger-stats" ? "stats" : "entry",
      { updateHash: false, forceRender: true }
    );
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", openLedger, { once: true });
  } else {
    void openLedger();
  }
})();
