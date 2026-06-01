"use client";

import { useEffect, useState } from "react";

export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const onToast = (e: any) => {
      setMsg(e.detail);
      setTimeout(() => setMsg(null), 2800);
    };
    window.addEventListener("screenhelp:toast", onToast);
    return () => window.removeEventListener("screenhelp:toast", onToast);
  }, []);
  if (!msg) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="glass-strong text-sm px-4 py-2.5 rounded-full text-text flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        {msg}
      </div>
    </div>
  );
}
