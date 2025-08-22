// src/components/BetaPrompt.tsx
import React from "react";
import { grantBeta1, getBetaStatus } from "../lib/betaUnlock";

type Props = {
  onActivate: () => void; // called after we grant beta1
  onClose?: () => void;
};

export default function BetaPrompt({ onActivate, onClose }: Props) {
  const handleContinue = () => {
    grantBeta1();
    onActivate();
  };

  const { beta1 } = getBetaStatus();

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Help us test during Beta?</h3>
        <p className="mt-2 text-gray-600">
          You’ve hit today’s free limit. During Beta, you can unlock <strong>5 extra searches</strong> to keep exploring.
        </p>
        {beta1 && (
          <p className="mt-2 text-xs text-green-700">
            (Looks like you already unlocked Beta 1 on this device. Continuing will refresh your allowance.)
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            className="rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100"
            onClick={onClose}
          >
            Not now
          </button>
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
            onClick={handleContinue}
          >
            Continue in Beta
          </button>
        </div>
      </div>
    </div>
  );
}
