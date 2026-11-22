"use client";

// S41 — the app's "Get the app" sheet (docs/2026-11-22_get_the_app_
// launch.md, item 2; board H2). Mounted once in the layout; anything
// that offers the app calls openGetApp() (src/lib/getApp.ts) and this
// shows the sheet. The sheet itself is the same HTML and CSS the public
// card page serves (src/lib/getAppSheet.ts), so the two can't drift.
// Never shown when running from the home-screen icon.

import React, { useEffect, useMemo, useRef, useState } from "react";

import { GET_APP_EVENT, getAppVariant, noteGetAppDismissed } from "../lib/getApp";
import { GET_APP_COPIED, GET_APP_SHEET_CSS, getAppSheetHtml, type GetAppVariant } from "../lib/getAppSheet";
import { isStandalone } from "../lib/installPrompt";
import { sendMeasure } from "../lib/measureClient";
import { copyText } from "../lib/shareLink";

export default function GetAppHost() {
  const [variant, setVariant] = useState<GetAppVariant | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = () => {
      if (!isStandalone()) setVariant(getAppVariant());
    };
    window.addEventListener(GET_APP_EVENT, open);
    return () => window.removeEventListener(GET_APP_EVENT, open);
  }, []);

  // While the sheet is up the page under it doesn't scroll; Escape closes.
  useEffect(() => {
    if (!variant) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVariant(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [variant]);

  const html = useMemo(() => (variant ? getAppSheetHtml(variant) : ""), [variant]);
  if (!variant) return null;

  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-ga-act]") as HTMLElement | null;
    const act = el?.getAttribute("data-ga-act");
    if (act === "close") setVariant(null);
    else if (act === "got") {
      sendMeasure({ event: "getapp_got_it" });
      noteGetAppDismissed();
      setVariant(null);
    } else if (act === "copy" && el) {
      void copyText(window.location.href).then((ok) => {
        if (ok) el.textContent = GET_APP_COPIED;
      });
    }
  };

  return (
    <div ref={rootRef} data-testid="get-app-sheet" onClick={onClick}>
      <style>{GET_APP_SHEET_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
