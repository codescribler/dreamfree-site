"use client";

import { useEffect, useRef, type RefObject } from "react";

interface BubbleState {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
}

function randomSpeed(): { vx: number; vy: number } {
  const speed = 0.15 + Math.random() * 0.35;
  const angle = Math.random() * Math.PI * 2;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

export function useBubblePhysics(): RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const bubbles = container.querySelectorAll<HTMLElement>("[data-bubble]");
    if (!bubbles.length) return;

    const state: BubbleState[] = [];

    bubbles.forEach((bubble) => {
      const size = bubble.offsetWidth;
      const containerW = container.offsetWidth;
      const containerH = container.offsetHeight;
      const x = Math.random() * (containerW - size);
      const y = Math.random() * (containerH - size);
      const v = randomSpeed();

      bubble.style.position = "absolute";
      bubble.style.left = "0";
      bubble.style.top = "0";
      bubble.style.transform = `translate(${x}px, ${y}px)`;

      state.push({ el: bubble, x, y, vx: v.vx, vy: v.vy, size });
    });

    let animId: number;

    function tick() {
      const containerW = container!.offsetWidth;
      const containerH = container!.offsetHeight;

      for (const b of state) {
        b.x += b.vx;
        b.y += b.vy;

        // Bounce off edges
        if (b.x <= 0) {
          b.x = 0;
          b.vx = Math.abs(b.vx);
        }
        if (b.y <= 0) {
          b.y = 0;
          b.vy = Math.abs(b.vy);
        }
        if (b.x + b.size >= containerW) {
          b.x = containerW - b.size;
          b.vx = -Math.abs(b.vx);
        }
        if (b.y + b.size >= containerH) {
          b.y = containerH - b.size;
          b.vy = -Math.abs(b.vy);
        }

        b.el.style.transform = `translate(${b.x}px, ${b.y}px)`;
      }

      animId = requestAnimationFrame(tick);
    }

    animId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animId);
  }, []);

  return containerRef;
}
