"use client";

// S8a — one quiet, dismissible line ("Tip: snap one or two shelves to
// compare bottles"). Precedent: Google Lens and Vivino teach the shelf shot
// with a single first-run line, not a tour. Shown at most `maxShows` times
// per device (counted once per page session, so re-renders don't spend
// it), gone for good on ×. Storage failures just mean it shows — never an
// error.

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

type Props = {
  storageKey: string;
  text: string;
  maxShows?: number;
  className?: string;
};

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const QuietTip: React.FC<Props> = ({ storageKey, text, maxShows = 3, className }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const key = `rekomendr.tip.${storageKey}`;
    if (read(`${key}.dismissed`) === "1") return;
    const shown = parseInt(read(`${key}.shown`) || "0", 10) || 0;
    let countedThisSession = false;
    try {
      countedThisSession = sessionStorage.getItem(`${key}.counted`) === "1";
    } catch {}
    if (!countedThisSession && shown >= maxShows) return;
    if (!countedThisSession) {
      write(`${key}.shown`, String(shown + 1));
      try {
        sessionStorage.setItem(`${key}.counted`, "1");
      } catch {}
    }
    setVisible(true);
  }, [storageKey, maxShows]);

  if (!visible) return null;

  return (
    <div
      className={[
        "flex items-start gap-2 text-[13px] leading-snug text-gray-300 sm:text-gray-600",
        className ?? "",
      ].join(" ")}
    >
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => {
          write(`rekomendr.tip.${storageKey}.dismissed`, "1");
          setVisible(false);
        }}
        className="shrink-0 p-0.5 text-gray-400 hover:text-gray-200 sm:hover:text-gray-700"
      >
        <X size={14} />
      </button>
    </div>
  );
};

export default QuietTip;
