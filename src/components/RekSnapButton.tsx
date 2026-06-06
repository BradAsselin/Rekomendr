'use client';
import React from 'react';
import { Camera } from 'lucide-react';

type Props = { onClick?: () => void };

export default function RekSnapButton({ onClick }: Props) {
  return (
    <div className="flex flex-col items-center w-full mt-10">
      <button
        onClick={onClick}
        className="rounded-[28px] bg-[#2D5AB5] flex flex-col items-center justify-center gap-3 shadow-xl active:scale-95 transition-transform"
        style={{ width: '60%', maxWidth: '240px', aspectRatio: '1' }}
        aria-label="RekSnap"
      >
        <Camera size={52} strokeWidth={1.5} color="white" />
        <span className="text-white font-medium text-xl tracking-wide">RekSnap</span>
      </button>
      <p className="mt-3 text-[11px] text-gray-400">powered by Reks Ray™</p>
      <p className="mt-1.5 text-[11px] text-gray-400 text-center px-8">
        Snap a menu, shelf, screen, or list — Rek anything.
      </p>
    </div>
  );
}
