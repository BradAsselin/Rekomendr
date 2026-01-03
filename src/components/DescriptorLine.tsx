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

  if (!list.length) return null;

  const text = list.map((d) => d.label).join(" • ");

  return (
    <div className="text-xs text-gray-600 mb-2 text-left w-full">
      {text}
    </div>
  );
}
