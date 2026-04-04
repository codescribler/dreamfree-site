"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const STAGGER_CONTAINERS = ["[data-stagger]"];

function revealElements() {
  const els = document.querySelectorAll("[data-reveal]:not(.visible)");
  if (!els.length) return () => {};

  // Assign stagger indices within grid parents
  document.querySelectorAll(STAGGER_CONTAINERS.join(",")).forEach((parent) => {
    const children = parent.querySelectorAll("[data-reveal]");
    children.forEach((child, i) => {
      (child as HTMLElement).style.setProperty("--i", String(i));
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );

  els.forEach((el) => observer.observe(el));
  return () => observer.disconnect();
}

export function useScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        el.classList.add("visible");
      });
      return;
    }

    // Wait two frames so the new route's DOM is fully painted
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        cleanup = revealElements();
      });
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [pathname]);
}
