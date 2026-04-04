"use client";

import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useBlobParallax } from "@/hooks/useBlobParallax";
import { useCtaNudge } from "@/hooks/useCtaNudge";
import { useTracking } from "@/hooks/useTracking";

export function Interactions() {
  useScrollReveal();
  useBlobParallax();
  useCtaNudge();
  useTracking();
  return null;
}
