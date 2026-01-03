"use client";

export default function Error() {
  return (
    <div className="p-6 text-red-300">
      <h1 className="text-xl font-semibold">Something went wrong.</h1>
      <p className="text-sm text-slate-400 mt-1">
        Please refresh the page or try again.
      </p>
    </div>
  );
}
