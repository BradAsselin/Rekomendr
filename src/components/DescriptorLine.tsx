// src/components/DescriptorLine.tsx
import React from "react";
import type { Rek } from "../engine/rekomendrEngine";
import { buildDescriptorsFromRek, type RekCategory } from "../lib/descriptors";

export default function DescriptorLine({
  rek,
  category,
}: {
  rek: Rek;
  category: RekCategory;
}) {
  const list = buildDescriptorsFromRek(rek, category);
  // S15 — a screen card's facts ride the same line ("2h 10m • on Netflix").
  const labels = [...list.map((d) => d.label), ...(rek.facts ?? [])];

  if (!labels.length) return null;

  const text = labels.join(" • ");

  return (
    <div className="text-xs text-gray-600 mb-2 text-left w-full">
      {text}
    </div>
  );
}
