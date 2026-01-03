// src/pages/upgrade.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { setTier } from "../lib/softWall";

export default function UpgradePage() {
  const router = useRouter();

  useEffect(() => {
    // Pretend user upgraded to paid
    setTier("paid");
    const t = setTimeout(() => {
      router.replace("/");
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-xl bg-white p-6 shadow-md">
        <h1 className="text-xl font-bold text-gray-900">Upgrading…</h1>
        <p className="mt-2 text-gray-600">Unlimited recs unlocked. Redirecting…</p>
      </div>
    </main>
  );
}
