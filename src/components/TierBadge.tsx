// src/components/TierBadge.tsx
import React, { useEffect, useState } from "react";
import { getTier, setTier, type Tier } from "../lib/softWall";

// Toggle this if you ONLY want controls in dev builds.
// const SHOW_CONTROLS = process.env.NODE_ENV !== "production";
const SHOW_CONTROLS = true; // always show for tester demos

export default function TierBadge() {
  const [tier, setTierState] = useState<Tier>("guest");
  const [open, setOpen] = useState(false);

  // Keep local state in sync with storage
  useEffect(() => {
    const update = () => setTierState(getTier());
    update();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "rekomendr.tier") update();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function applyTier(next: Tier) {
    setTier(next);
    setTierState(next);
    setOpen(false);
  }

  const pillBg =
    tier === "paid" ? "bg-green-600" : tier === "free" ? "bg-blue-600" : "bg-gray-700";

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Badge */}
      <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold text-white shadow-md ${pillBg}`}>
        {tier === "paid" ? "Paid (Unlimited)" : tier === "free" ? "Free (10/day)" : "Guest (5/day)"}

        {SHOW_CONTROLS && (
          <button
            onClick={() => setOpen((s) => !s)}
            aria-label="Tier controls"
            className="rounded-full bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
            title="Tier controls"
          >
            ⋯
          </button>
        )}
      </div>

      {/* Popover controls */}
      {SHOW_CONTROLS && open && (
        <div className="mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 text-sm shadow-xl">
          <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Test controls
          </div>
          <button
            onClick={() => applyTier("guest")}
            className="w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            title="Reset to guest (5/day)"
          >
            Reset to <strong>Guest</strong> (5/day)
          </button>
          <button
            onClick={() => applyTier("free")}
            className="w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            title="Switch to free (10/day)"
          >
            Switch to <strong>Free</strong> (10/day)
          </button>
          <button
            onClick={() => applyTier("paid")}
            className="w-full rounded-lg px-3 py-2 text-left hover:bg-gray-50"
            title="Switch to paid (unlimited)"
          >
            Switch to <strong>Paid</strong> (unlimited)
          </button>
          <div className="mt-1 flex items-center justify-between px-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg border px-3 py-1.5 text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
            <a
              href="javascript:void(0)"
              onClick={() => {
                // clears today’s counter only; tier unchanged
                const d = new Date();
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                const key = `rekomendr.searches.${yyyy}-${mm}-${dd}`;
                localStorage.removeItem(key);
                setOpen(false);
              }}
              className="text-xs text-gray-500 hover:underline"
              title="Reset today’s search count"
            >
              Reset today’s count
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
