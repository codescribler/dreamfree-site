"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useMagnetic<T extends HTMLElement>(
  strength = 0.3
): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };

    const onLeave = () => {
      el.style.transform = "";
      el.style.transition =
        "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
      const timeout = setTimeout(() => {
        el.style.transition = "";
      }, 400);
      return () => clearTimeout(timeout);
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, [strength]);

  return ref;
}
