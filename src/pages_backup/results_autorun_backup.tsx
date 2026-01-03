// src/pages/index.tsx
import { useRouter } from "next/router";
import RekButton from "../components/RekButton";

export default function Home() {
  const router = useRouter();

  const handleCategory = (vertical: string) => {
    router.push(`/results?vertical=${vertical}`);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white px-4">
      {/* Header */}
      <h1 className="text-4xl font-bold mb-2 mt-8 tracking-tight">
        Rekomendr.AI
      </h1>
      <p className="text-sm text-gray-400 mb-10">
        It’s like we read your mind. But better.
      </p>

      {/* Category bubbles */}
      <div className="flex gap-4 mb-12 flex-wrap justify-center">
        {["Movies", "TV Shows", "Wine", "Books"].map((v) => (
          <button
            key={v}
            onClick={() => handleCategory(v.toLowerCase())}
            className="bg-gray-700 hover:bg-gray-600 text-white px-5 py-2 rounded-full text-sm font-medium"
          >
            {v}
          </button>
        ))}
      </div>

      {/* Big Rek Button */}
      <RekButton />

      {/* Footer */}
      <div className="text-gray-500 text-xs mt-8">
        © {new Date().getFullYear()} BRAD & CHAD MUSIC CO.
      </div>
    </main>
  );
}
