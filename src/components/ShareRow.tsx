"use client";

// S6 — the Share row, lifted out of RekSnapResults so the anchor and every
// rek card run the same one-tap flow: first tap ever asks for a name once
// (one field, skippable), then mint (the caller's getSnapshot — never gated
// on Save) → flip public → native sheet / clipboard → "sent" event. The
// card page and "from <name>" are the same for every card.
// Mounted per item; the caller keys it so a new result starts fresh.

import React, { useEffect, useId, useRef, useState } from "react";
import { shareOrCopy } from "../lib/shareLink";
import { flipShare, postJson, type MintOutcome } from "../lib/shareSnapshot";
import {
  markSenderNameAsked,
  recordCardSent,
  saveSenderName,
  senderNameAsked,
  storedSenderName,
} from "../lib/senderName";
import { getAnonymousClientId } from "../lib/userPrefs";

// S2 — the one refusal voice for Share (decided copy, #19 Call 2): the
// row stays private and the save stands. An unsaved rek has no save to
// stand, so it gets the first half only.
const SHARE_REFUSED_MSG = "couldn't share this one — it's still saved";
const SHARE_REFUSED_UNSAVED_MSG = "couldn't share this one";

type ShareState = {
  status: "idle" | "working" | "ready" | "refused";
  url?: string;
  // iOS refused the native sheet after the network wait — one more tap
  // (a fresh gesture) opens it.
  needsTap?: boolean;
  // Shown when no sheet and no clipboard exist: the link, to copy by hand.
  note?: string;
};

type Props = {
  title: string;
  // The snapshot to share. Mints as needed; never depends on Save.
  getSnapshot: () => Promise<MintOutcome>;
  // Runs on the tap itself, before any network (the anchor: sharing is
  // keeping, so its Save mark lights up).
  onTap?: () => void;
  saved?: boolean;
  // "as Brad" / "add your name" beside Share — the anchor only, so the
  // rek cards don't each repeat it.
  showNameLink?: boolean;
  // Anchor: a row under the card. Rek: a quiet row inside the card.
  variant?: "anchor" | "rek";
};

const ShareRow: React.FC<Props> = ({
  title,
  getSnapshot,
  onTap,
  saved,
  showNameLink,
  variant = "rek",
}) => {
  const [share, setShare] = useState<ShareState>({ status: "idle" });
  const [nameSheet, setNameSheet] = useState<null | "first" | "change">(null);
  const [nameDraft, setNameDraft] = useState("");
  const [senderName, setSenderName] = useState<string | null>(null);
  const [nameAsked, setNameAsked] = useState(true);
  const idRef = useRef<string | null>(null);
  const alive = useRef(true);
  const inputId = useId();
  useEffect(() => {
    alive.current = true;
    setSenderName(storedSenderName());
    setNameAsked(senderNameAsked());
    return () => {
      alive.current = false;
    };
  }, []);
  // The prompt opens under Share, which on a phone is often at the bottom
  // edge of the screen: bring it into view (the keyboard takes the rest).
  const nameFormRef = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (nameSheet) nameFormRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nameSheet]);

  const send = async (url: string) => {
    const outcome = await shareOrCopy({ title, text: title, url });
    // S4 instrumentation: "card sent" once the link actually left — a
    // closed sheet or a refused gesture is not a send.
    if (outcome === "shared" || outcome === "copied" || outcome === "manual") {
      const cardId = url.split("/a/")[1];
      if (cardId) recordCardSent(cardId);
    }
    if (!alive.current) return;
    if (outcome === "not_allowed") setShare({ status: "ready", url, needsTap: true });
    else if (outcome === "copied") setShare({ status: "ready", url, note: "Link copied!" });
    else if (outcome === "manual") setShare({ status: "ready", url, note: url });
    else setShare({ status: "ready", url });
  };

  // `profileReady` is the name save from the first-share prompt; the flip
  // waits for it so the very first card already carries the name.
  const run = async (profileReady?: Promise<unknown>) => {
    if (share.status === "working") return;
    onTap?.();
    // Already public: a fresh gesture straight into the sheet.
    if (share.status === "ready" && share.url) {
      await send(share.url);
      return;
    }
    setShare({ status: "working" });
    const clientId = getAnonymousClientId();
    try {
      // One row per item: a retap after a failed flip reuses the minted id.
      let id = idRef.current;
      if (!id) {
        const minted = await getSnapshot();
        if (!minted.id) {
          console.warn("[share] no snapshot to share", { reason: minted.reason });
          if (alive.current) setShare({ status: "refused" });
          return;
        }
        id = minted.id;
        idRef.current = id;
      }
      if (profileReady) await profileReady.catch(() => {});
      const flip = await flipShare(id, clientId, postJson);
      if (!alive.current) return;
      if (!flip.ok) {
        console.warn("[share] refused", { reason: flip.reason });
        setShare({ status: "refused" });
        return;
      }
      // The lazy long tier (Q5(i)) runs in its own request so the share
      // sheet never waits on a generation. keepalive lets it outlive a
      // tab the user closes right after sending.
      if (flip.needsCompletion) {
        void fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", clientId, id }),
          keepalive: true,
        }).catch(() => {});
      }
      await send(`${window.location.origin}/a/${id}`);
    } catch (err) {
      console.warn("[share] request failed", err);
      if (alive.current) setShare({ status: "refused" });
    }
  };

  // First time ever: ask for a name once. The sheet's own button is a
  // fresh tap, so the share sheet still opens from a user gesture.
  const onShareTap = () => {
    if (share.status === "working") return;
    if (!senderNameAsked() && share.status !== "ready") {
      setNameDraft("");
      setNameSheet("first");
      return;
    }
    void run();
  };

  const submitNameSheet = (skip: boolean) => {
    const mode = nameSheet;
    const name = skip ? "" : nameDraft.replace(/\s+/g, " ").trim().slice(0, 40);
    setNameSheet(null);
    setNameAsked(true);
    if (name) setSenderName(name);
    const savedName = name ? saveSenderName(name) : (markSenderNameAsked(), Promise.resolve(false));
    if (mode === "first") {
      void run(savedName);
    } else if (name && share.status === "ready") {
      // A changed name reaches this card too: the next Share tap goes
      // back through the (idempotent) flip, which restamps the name.
      setShare({ status: "idle" });
    }
  };

  const anchor = variant === "anchor";
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div
        className={
          anchor
            ? "-mt-1 mb-2 flex items-center justify-end gap-3 px-1 text-sm"
            : "mt-2 flex items-center justify-end gap-3 text-sm"
        }
      >
        {share.note && (
          <span className="text-[13px] text-gray-400 sm:text-gray-500 select-all break-all">
            {share.note}
          </span>
        )}
        {/* S4 — "a way to change it later": the name the cards carry, or
            an offer to add one after a Skip. Quiet, beside Share. */}
        {showNameLink && nameAsked && !nameSheet && (
          <button
            type="button"
            onClick={() => {
              setNameDraft(senderName ?? "");
              setNameSheet("change");
            }}
            className="mr-auto text-[13px] text-gray-400 sm:text-gray-500 hover:underline"
          >
            {senderName ? `as ${senderName}` : "add your name"}
          </button>
        )}
        <button
          type="button"
          onClick={onShareTap}
          disabled={share.status === "working"}
          className={
            anchor
              ? "font-medium text-blue-300 sm:text-[#1E3A8A] hover:underline disabled:opacity-60"
              : "font-medium text-[#1E3A8A] hover:underline disabled:opacity-60"
          }
        >
          {share.status === "working" ? "Sharing…" : share.needsTap ? "Send link" : "Share"}
        </button>
      </div>
      {nameSheet && (
        <form
          ref={nameFormRef}
          className={`bg-white border border-gray-200 rounded-2xl p-4 shadow-sm ${anchor ? "mb-3" : "mt-2"}`}
          onSubmit={(e) => {
            e.preventDefault();
            submitNameSheet(false);
          }}
        >
          <label htmlFor={inputId} className="block text-sm text-gray-800 mb-2">
            Your name, so friends know it’s from you.
          </label>
          <input
            id={inputId}
            type="text"
            autoFocus
            autoComplete="given-name"
            maxLength={40}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base text-gray-900"
          />
          <div className="mt-3 flex justify-end gap-3 text-sm">
            <button
              type="button"
              onClick={() => (nameSheet === "first" ? submitNameSheet(true) : setNameSheet(null))}
              className="px-3 py-2 text-gray-600 hover:underline"
            >
              {nameSheet === "first" ? "Skip" : "Cancel"}
            </button>
            <button type="submit" className="rounded-xl bg-[#1E3A8A] px-4 py-2 font-medium text-white">
              {nameSheet === "first" ? "Share" : "Save"}
            </button>
          </div>
        </form>
      )}
      {share.status === "refused" && (
        <div className={`bg-white border border-amber-300 rounded-2xl p-4 shadow-sm ${anchor ? "mb-3" : "mt-2"}`}>
          <div className="text-sm text-gray-800">
            {saved ? SHARE_REFUSED_MSG : SHARE_REFUSED_UNSAVED_MSG}
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareRow;
