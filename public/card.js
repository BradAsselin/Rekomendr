// public/card.js — S4 test instrumentation for the public card (/a/{id}).
// Logs one "open" per page load and each Watch / Trailer / Buy tap, keyed
// by the visitor's anonymous id — the SAME localStorage id the app uses
// (rekomendr.client_id), so a receiver who later opens the app and shares
// is recognised as the same person. No names, no fingerprinting, nothing
// else leaves the page. Link scrapers don't run scripts, so a link preview
// is never counted as an open.
(function () {
  var s = document.currentScript;
  var card = s && s.getAttribute("data-card");
  if (!card) return;
  var KEY = "rekomendr.client_id";
  var id = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id =
        "anon_" +
        (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + "_" + Math.random().toString(36).slice(2));
      localStorage.setItem(KEY, id);
    }
  } catch (e) {
    id = null; // storage blocked (private mode): count nothing rather than guess
  }
  if (!id) return;

  function send(kind) {
    var body = JSON.stringify({ kind: kind, card: card, clientId: id });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon("/api/card/event", new Blob([body], { type: "application/json" }))) return;
    } catch (e) {}
    try {
      fetch("/api/card/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  send("open");
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-ev]") : null;
      if (el) send(el.getAttribute("data-ev"));
    },
    true
  );
})();
