// src/components/BetaEmailPrompt.tsx
import React, { useState } from "react";
import { grantBeta2, getBetaStatus } from "../lib/betaUnlock";

type Props = {
  onActivate: (email: string) => void; // called after we grant beta2
  onClose?: () => void;
};

export default function BetaEmailPrompt({ onActivate, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { beta2 } = getBetaStatus();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/\S+@\S+\.\S+/.test(email)) return;
    setSubmitting(true);
    try {
      grantBeta2(email);
      // Optional: POST to /api/email to log
      // await fetch("/api/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      onActivate(email);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Unlock Beta Plus?</h3>
        <p className="mt-2 text-gray-600">
          You’ve reached your extended limit. Enter your email to unlock <strong>5 more searches</strong> today.
        </p>
        {beta2 && (
          <p className="mt-2 text-xs text-green-700">
            (You already unlocked Beta 2 on this device. Re-enter to continue.)
          </p>
        )}
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input
            type="email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            required
          />
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "Unlocking…" : "Unlock with Email"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
