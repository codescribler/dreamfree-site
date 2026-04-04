"use client";

import { useEffect } from "react";

export function useBlobParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const blobs = document.querySelectorAll("[data-blob]");

          blobs.forEach((blob, i) => {
            const section = blob.parentElement;
            if (!section) return;
            const rect = section.getBoundingClientRect();
            // Only animate if section is near viewport
            if (rect.bottom < -200 || rect.top > window.innerHeight + 200)
              return;
            const speed = i % 2 === 0 ? 0.03 : -0.02;
            const offset = scrollY * speed;
            (blob as HTMLElement).style.transform = `translateY(${offset}px)`;
          });

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
}
