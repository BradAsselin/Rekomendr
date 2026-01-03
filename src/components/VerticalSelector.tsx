// src/components/VerticalSelector.tsx
import React from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

const VERTICALS = [
  { v: "movies", label: "Movies" },
  { v: "tv",     label: "TV Shows" },
  { v: "wine",   label: "Wine" },
  { v: "beer",   label: "Beer" },
];

export default function VerticalSelector({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent pl-3 pr-2 py-3 text-sm font-medium text-gray-200
                 focus:outline-none appearance-none"
      aria-label="Select vertical"
    >
      {VERTICALS.map(({ v, label }) => (
        <option key={v} value={v} className="text-gray-900">
          {label}
        </option>
      ))}
    </select>
  );
}
