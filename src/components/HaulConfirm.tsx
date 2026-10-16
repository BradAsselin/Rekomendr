"use client";

// S8c — the haul (docs/s8-wine-shelf-plan.md). A photo of a cart, a basket
// or a few bottles on the counter is a PURCHASE, not a search: one short
// list to confirm. Each bottle can be removed (×) or corrected (tap the
// name). Confirm saves them as Bought; the haul can then be shared like any
// card ("Our haul today"), optional.

import React, { useState } from "react";
import { Check, X } from "lucide-react";

import ShareRow from "./ShareRow";
import { getAnonymousClientId } from "../lib/userPrefs";
import { postJson, snapshotForShare, type MintOutcome } from "../lib/shareSnapshot";
import { saveHaul, type HaulCard } from "../lib/wineVisit";

type Props = {
  initial: string[];
  // "Not a purchase" — back to the ordinary result.
  onCancel?: () => void;
  onSaved?: () => void;
};

const HaulConfirm: React.FC<Props> = ({ initial, onCancel, onSaved }) => {
  const [names, setNames] = useState<string[]>(() =>
    Array.from(new Set(initial.map((n) => n.trim()).filter(Boolean))).slice(0, 24)
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [state, setState] = useState<"confirm" | "saving" | "saved" | "failed">("confirm");
  const [card, setCard] = useState<HaulCard | null>(null);

  const confirm = async () => {
    const list = names.map((n) => n.trim()).filter(Boolean);
    if (!list.length || state === "saving") return;
    setEditing(null);
    setState("saving");
    const r = await saveHaul(list);
    if (!r.ok) {
      setState("failed");
      return;
    }
    setCard(r.card);
    setState("saved");
    onSaved?.();
  };

  const getSnapshot = (): Promise<MintOutcome> =>
    card
      ? snapshotForShare({
          item: { ...card, mode: "similar" },
          clientId: getAnonymousClientId(),
          post: postJson,
        })
      : Promise.resolve({ id: null, reason: "no_token" });

  if (state === "saved") {
    return (
      <div className="w-full rounded-2xl border border-gray-300 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-[15px] text-gray-900">
          <Check size={18} className="text-[#2D5AB5]" />
          Saved to your Bought list — {names.length} {names.length === 1 ? "bottle" : "bottles"}.
        </div>
        <div className="mt-1 text-[13px] text-gray-600">
          Next time you open the app, one quick question: how was it?
        </div>
        {card && <ShareRow title={card.name} getSnapshot={getSnapshot} />}
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border-[3px] border-[#1E3A8A] bg-white p-5 shadow-lg">
      <div className="text-[17px] font-semibold text-gray-900">You bought:</div>
      <ul className="mt-2 divide-y divide-gray-100">
        {names.map((n, i) => (
          <li key={i} className="flex items-center gap-2 py-2">
            {editing === i ? (
              <input
                autoFocus
                value={n}
                onChange={(e) =>
                  setNames((prev) => prev.map((x, j) => (j === i ? e.target.value.slice(0, 120) : x)))
                }
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditing(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-2 py-1 text-[15px] text-gray-900 outline-none focus:border-[#2D5AB5]"
                aria-label="Correct the bottle's name"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(i)}
                className="flex-1 text-left text-[15px] text-gray-900 hover:underline"
                title="Tap to correct"
              >
                {n || <span className="text-gray-400">(name)</span>}
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${n}`}
              onClick={() => {
                setEditing(null);
                setNames((prev) => prev.filter((_, j) => j !== i));
              }}
              className="shrink-0 p-1 text-gray-400 hover:text-gray-700"
            >
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 text-[13px] text-gray-600">Correct? Tap a name to fix it, × to remove it.</div>
      {state === "failed" && (
        <div className="mt-2 text-[13px] text-amber-700">Couldn’t save that just now. Try again in a moment.</div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={confirm}
          disabled={names.filter((n) => n.trim()).length === 0 || state === "saving"}
          className="rounded-xl bg-[#2D5AB5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Yes, save them"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:underline">
            Not a purchase
          </button>
        )}
      </div>
    </div>
  );
};

export default HaulConfirm;
