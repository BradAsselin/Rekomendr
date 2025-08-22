// src/lib/betaUnlock.ts
// Client-side beta unlock helpers (MVP). Uses localStorage.

export type BetaStatus = {
  beta1: boolean; // first unlock (to 10/day)
  beta2: boolean; // second unlock (to 15/day)
  email?: string;
};

const KEY = "rex_beta_status_v1";

function read(): BetaStatus {
  if (typeof window === "undefined") return { beta1: false, beta2: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { beta1: false, beta2: false };
    const parsed = JSON.parse(raw) as BetaStatus;
    return {
      beta1: !!parsed.beta1,
      beta2: !!parsed.beta2,
      email: parsed.email,
    };
  } catch {
    return { beta1: false, beta2: false };
  }
}

function write(status: BetaStatus) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(status));
}

export function getBetaStatus(): BetaStatus {
  return read();
}

export function grantBeta1(): BetaStatus {
  const s = read();
  if (!s.beta1) {
    s.beta1 = true;
    write(s);
  }
  return s;
}

export function grantBeta2(email?: string): BetaStatus {
  const s = read();
  if (!s.beta2) {
    s.beta2 = true;
    if (email) s.email = email;
    write(s);
  }
  return s;
}

export function clearBetaForDev() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
