"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAnonymousId } from "./useAnonymousId";

const SCROLL_THRESHOLDS = [25, 50, 75, 100];

/**
 * Automatic page view and scroll depth tracking.
 * Mounts in Interactions.tsx (root layout).
 */
export function useTracking() {
  const pathname = usePathname();
  const track = useMutation(api.events.track);
  const { anonymousId, sessionId } = useAnonymousId();
  const reportedThresholds = useRef(new Set<number>());

  // Track page views on route change
  useEffect(() => {
    if (!anonymousId) return;

    track({
      type: "page_view",
      anonymousId,
      sessionId,
      path: pathname,
      properties: {
        referrer: document.referrer,
        title: document.title,
      },
    });

    // Reset scroll thresholds on new page
    reportedThresholds.current.clear();
  }, [pathname, anonymousId, sessionId, track]);

  // Track scroll depth
  useEffect(() => {
    if (!anonymousId) return;

    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight;
        const winHeight = window.innerHeight;
        const scrollable = docHeight - winHeight;

        if (scrollable <= 0) {
          ticking = false;
          return;
        }

        const percent = Math.round((scrollTop / scrollable) * 100);

        for (const threshold of SCROLL_THRESHOLDS) {
          if (
            percent >= threshold &&
            !reportedThresholds.current.has(threshold)
          ) {
            reportedThresholds.current.add(threshold);
            track({
              type: "scroll_depth",
              anonymousId,
              sessionId,
              path: pathname,
              properties: { depth: threshold },
            });
          }
        }

        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname, anonymousId, sessionId, track]);
}
