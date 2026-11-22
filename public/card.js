// public/card.js — the public card's only script (/a/{id}).
//
// S4 — test instrumentation: one "open" per page load and each Watch /
// Trailer / Buy tap, keyed by the visitor's anonymous id — the SAME
// localStorage id the app uses (rekomendr.client_id), so a receiver who
// later opens the app and shares is recognised as the same person. No
// names, no fingerprinting. Link scrapers don't run scripts, so a link
// preview is never counted as an open.
//
// S41 (docs/2026-11-22_get_the_app_launch.md) — Get the app:
//   * Chrome's own install prompt when it handed us one (one tap);
//   * otherwise the sheet the page already holds (src/lib/getAppSheet.ts),
//     in the variant that matches this browser;
//   * never when the page runs from the home-screen icon.
// Its counts (and "Open Rekomendr tapped") go to /api/signals as kind
// "measure": the event's name only, no device id stored (measureRow.ts).
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

  function post(url, payload) {
    if (!id) return;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
    } catch (e) {}
    try {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  function send(kind) {
    post("/api/card/event", { kind: kind, card: card, clientId: id });
  }
  function measure(event) {
    post("/api/signals", { clientId: id, kind: "measure", event: event });
  }

  // --- Get the app ---------------------------------------------------------
  var ua = navigator.userAgent || "";
  var standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  if (standalone) document.documentElement.className += " standalone";

  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    if (e.preventDefault) e.preventDefault();
    deferred = e;
  });

  // The same rule as the app's getAppVariantFor (src/lib/getApp.ts).
  function variant() {
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      var safari = /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV|Line\//.test(ua);
      if (!safari) return "inapp-ios";
      var m = /Version\/(\d+)/.exec(ua);
      var v = m ? Number(m[1]) : null;
      if (v == null || v >= 27) return "ios27";
      return v === 26 ? "ios26" : "ios";
    }
    return /; wv\)|FBAN|FBAV|FB_IAB|Instagram|Line\//.test(ua) ? "inapp-android" : "android";
  }

  var sheet = document.querySelector("[data-ga]");
  function showSheet() {
    if (!sheet) return;
    sheet.setAttribute("data-variant", variant());
    sheet.removeAttribute("hidden");
  }
  function hideSheet() {
    if (sheet) sheet.setAttribute("hidden", "");
  }
  // "Got it" (or a "no" to Chrome's prompt) is remembered where the app's
  // own ask reads it: it waits 14 days, and after three it never returns.
  function noteDismissed() {
    try {
      var st = JSON.parse(localStorage.getItem("rekomendr.get_app_ask") || "null") || {};
      localStorage.setItem("rekomendr.get_app_ask", JSON.stringify({ n: (Number(st.n) || 0) + 1, at: Date.now() }));
    } catch (e) {}
  }
  function copyLink(el) {
    var done = function () {
      el.textContent = "Link copied";
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(location.href).then(done, function () {});
        return;
      }
    } catch (e) {}
    try {
      var ta = document.createElement("textarea");
      ta.value = location.href;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      if (document.execCommand("copy")) done();
      document.body.removeChild(ta);
    } catch (e) {}
  }
  function getApp() {
    if (standalone) return;
    measure("getapp_open");
    var e = deferred;
    if (!e) return showSheet();
    deferred = null;
    try {
      Promise.resolve(e.prompt())
        .then(function () {
          return e.userChoice;
        })
        .then(function (choice) {
          if (choice && choice.outcome === "accepted") return measure("install_accepted");
          noteDismissed();
          measure("install_dismissed");
        })
        .catch(showSheet);
    } catch (err) {
      showSheet();
    }
  }

  send("open");
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      var el = t.closest("[data-ev]");
      if (el) send(el.getAttribute("data-ev"));
      if (t.closest("[data-open-app]")) measure("card_open_app");
      if (t.closest("[data-get-app]")) getApp();
      var act = t.closest("[data-ga-act]");
      if (act) {
        var a = act.getAttribute("data-ga-act");
        if (a === "close") hideSheet();
        else if (a === "got") {
          measure("getapp_got_it");
          noteDismissed();
          hideSheet();
        } else if (a === "copy") copyLink(act);
      }
    },
    true
  );
})();
