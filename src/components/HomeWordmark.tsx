"use client";

// S26a — the wordmark, top-left in the top bar (board F1). It is the app's
// only home affordance, as the big centered one was: on the home route it
// asks the page to reset (the page owns that state), anywhere else it
// navigates home.
// S28c — centered on its own row under ⋯, at the original centered logo's
// weight and blue, about 34px (26px on a short screen).

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
      className="text-[34px] leading-tight font-bold tracking-tight text-[#2D5AB5] [@media(max-height:700px)]:text-[26px]"
    >
      Rekomendr<span className="text-[#2D5AB5]/70">.AI</span>
    </button>
  );
}
