"use client";

import { useEffect } from "react";

const DWELL_MS = 2000;
const COOLDOWN_MS = 8000;

export function useCtaNudge() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = document.querySelectorAll<HTMLElement>(
      "[data-cta-nudge]"
    );
    if (!targets.length) return;

    // Create nudge ring elements
    const rings: HTMLDivElement[] = [];
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement("div");
      ring.className =
        "pointer-events-none fixed z-[99] rounded-full border-2 border-teal opacity-0 -translate-x-1/2 -translate-y-1/2";
      ring.style.width = "0";
      ring.style.height = "0";
      document.body.appendChild(ring);
      rings.push(ring);
    }

    const cleanups: (() => void)[] = [];

    targets.forEach((btn) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let locked = false;

      const onEnter = () => {
        if (locked) return;
        timer = setTimeout(() => {
          fireNudge(btn);
          locked = true;
          setTimeout(() => {
            locked = false;
          }, COOLDOWN_MS);
        }, DWELL_MS);
      };

      const onLeave = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const onClick = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      btn.addEventListener("mouseenter", onEnter);
      btn.addEventListener("mouseleave", onLeave);
      btn.addEventListener("click", onClick);

      cleanups.push(() => {
        btn.removeEventListener("mouseenter", onEnter);
        btn.removeEventListener("mouseleave", onLeave);
        btn.removeEventListener("click", onClick);
      });
    });

    function fireNudge(btn: HTMLElement) {
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      rings.forEach((ring) => {
        ring.style.left = `${cx}px`;
        ring.style.top = `${cy}px`;
        ring.style.width = "10px";
        ring.style.height = "10px";
        ring.style.opacity = "0.5";
        ring.style.borderWidth = "2px";
        ring.classList.remove("animate-nudge-pulse");
      });

      // Force reflow
      void rings[0].offsetWidth;

      rings.forEach((ring, i) => {
        ring.style.animation = `nudge-pulse 1.6s var(--ease-out-custom) ${i * 0.15}s forwards`;
      });

      // Shimmer + bounce on button
      btn.classList.add("cta-shimmer", "cta-bounce");

      setTimeout(() => {
        rings.forEach((ring) => {
          ring.style.animation = "";
          ring.style.opacity = "0";
        });
        btn.classList.remove("cta-shimmer", "cta-bounce");
      }, 1800);
    }

    return () => {
      cleanups.forEach((fn) => fn());
      rings.forEach((ring) => ring.remove());
    };
  }, []);
}
