"use client";

import { useEffect, useRef, type RefObject } from "react";

interface HeroParallaxRefs {
  imageRef: RefObject<HTMLDivElement | null>;
  badgeRef: RefObject<HTMLDivElement | null>;
}

export function useHeroParallax(): HeroParallaxRefs {
  const imageRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          if (y < window.innerHeight) {
            if (imageRef.current) {
              imageRef.current.style.transform = `translateY(${y * 0.06}px)`;
            }
            if (badgeRef.current) {
              badgeRef.current.style.transform = `translateY(${y * -0.03}px)`;
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return { imageRef, badgeRef };
}
