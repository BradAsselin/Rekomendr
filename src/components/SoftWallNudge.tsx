// src/components/SoftWallNudge.tsx
import React from "react";

export default function SoftWallNudge(props: {
  count: number;
  limit: number;
  tier: "guest" | "free" | "paid";
  onClose: () => void;
  onSignIn?: () => void;
  onUpgrade?: () => void;
}) {
  const { count, limit, tier, onClose, onSignIn, onUpgrade } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-xl font-extrabold text-gray-900">You’ve hit today’s free limit</h3>
        <p className="mt-2 text-gray-700">
          You’ve used <strong>{count}</strong> of <strong>{limit}</strong> searches for your current plan ({tier}).
        </p>
        <div className="mt-4 space-y-2 text-sm text-gray-600">
          {tier === "guest" && (
            <>
              <p>Sign in to get <strong>10 searches/day</strong>.</p>
              <p>Upgrade later for <strong>unlimited</strong> and deeper personalization.</p>
            </>
          )}
          {tier === "free" && (
            <>
              <p>Upgrade to get <strong>unlimited</strong> and personalized recs from your likes & dislikes.</p>
            </>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {tier === "guest" ? (
            <button
              onClick={onSignIn}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Sign in for 10/day
            </button>
          ) : (
            <button
              onClick={onUpgrade}
              className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            >
              Upgrade for unlimited
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-gray-700 hover:bg-gray-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
