// src/pages/index.tsx
import { useState } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Sit back and relax while we Rek it for you...");

  // ---- Handle text query ----
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsLoading(true);
    setLoadingText("Finding your Reks...");
    setTimeout(() => {
      router.push(`/results?q=${encodeURIComponent(query)}&v=movies`);
    }, 800);
  };

  // ---- Handle photo capture ----
  const handleRekSnap = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment"; // opens camera on mobile if possible

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsLoading(true);
      setLoadingText("Analyzing your photo and fetching your Reks...");

      try {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result?.toString().split(",")[1];
          const resp = await fetch("/api/recs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: "Image-based Rek",
              referenced_image: base64,
              vertical: "movies",
            }),
          });
          const data = await resp.json();
          console.log("RekSnap result:", data);
          router.push(`/results?v=movies`);
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error("RekSnap error:", err);
        setIsLoading(false);
      }
    };
    input.click();
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white px-4">
      {/* Header */}
      <h1 className="text-4xl font-bold mb-2 tracking-tight">Rekomendr.AI</h1>
      <p className="text-sm text-gray-400 mb-10">It’s like we read your mind. But better.</p>

      {/* --- Text Search Box --- */}
      <form onSubmit={handleSearch} className="w-full max-w-md mb-10">
        <div className="flex items-center bg-gray-800 rounded-full shadow-md overflow-hidden">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What can I find for you?"
            className="flex-grow px-4 py-3 bg-transparent text-white placeholder-gray-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="bg-gradient-to-r from-indigo-500 to-pink-500 text-white font-semibold px-6 py-3 rounded-r-full hover:opacity-90 transition-all"
          >
            GO
          </button>
        </div>
      </form>

      {/* --- OR Divider --- */}
      <div className="text-gray-500 mb-8 text-sm uppercase tracking-widest">or</div>

      {/* --- Big REK Button --- */}
      <button
        onClick={handleRekSnap}
        disabled={isLoading}
        className="relative rounded-full w-36 h-36 bg-gradient-to-r from-indigo-500 to-pink-500 shadow-[0_0_30px_rgba(255,255,255,0.2)] text-white text-2xl font-bold flex items-center justify-center transition-all duration-300 hover:scale-105 hover:shadow-[0_0_45px_rgba(255,255,255,0.4)]"
      >
        {isLoading ? "Reking..." : "REK"}
      </button>

      {/* --- Spinner Text --- */}
      {isLoading && (
        <p className="mt-6 text-gray-400 text-sm animate-pulse text-center px-8">
          {loadingText}
        </p>
      )}

      {/* --- Footer --- */}
      <div className="text-gray-500 text-xs mt-16">
        Powered by <span className="text-gray-300">Reks Ray™</span>
      </div>
    </main>
  );
}
