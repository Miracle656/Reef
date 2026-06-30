"use client";

import { createPortal } from "react-dom";
import { XIcon } from "./icons";

export function ImageViewer({ url, alt, onClose }: { url: string; alt?: string; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
        <XIcon className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt ?? "image"} className="max-h-[90vh] max-w-full rounded-[14px] object-contain" onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}
