'use client';
import React from 'react';

type Props = { onClick?: () => void };

export default function RekSnapButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="px-6 py-4 rounded-2xl bg-[#0f1b2c] text-[#cde3ff] shadow hover:brightness-110"
    >
      REK SNAP
    </button>
  );
}
