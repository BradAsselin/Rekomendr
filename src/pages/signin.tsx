// src/pages/signin.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { setTier } from "../lib/softWall";

export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    // Pretend user signed in successfully
    setTier("free");
    // Small delay so you can see the page flash if needed
    const t = setTimeout(() => {
      router.replace("/");
    }, 800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-xl bg-white p-6 shadow-md">
        <h1 className="text-xl font-bold text-gray-900">Signing you in…</h1>
        <p className="mt-2 text-gray-600">You’ll be redirected shortly.</p>
      </div>
    </main>
  );
}
