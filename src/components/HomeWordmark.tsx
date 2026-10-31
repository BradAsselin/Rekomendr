"use client";

// S26a — the wordmark, top-left in the top bar (board F1). It is the app's
// only home affordance, as the big centered one was: on the home route it
// asks the page to reset (the page owns that state), anywhere else it
// navigates home.

import React from "react";

export const HOME_EVENT = "rekomendr:home";

export default function HomeWordmark() {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.location.pathname === "/") window.dispatchEvent(new Event(HOME_EVENT));
        else window.location.assign("/");
      }}
      aria-label="Back to home"
      data-testid="home-wordmark"
      className="text-[22px] font-bold tracking-tight text-[#3B6BD4]"
    >
      Rekomendr<span className="text-[#3B6BD4]/70">.AI</span>
    </button>
  );
}
