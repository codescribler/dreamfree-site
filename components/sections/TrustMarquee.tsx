"use client";

import { useRef } from "react";

const items = [
  "The Signal Method",
  "100+ Websites Scored",
  "Royal Marine Commando",
  "Hertfordshire",
  "Build & Stay",
  "Free Signal Score",
];

export function TrustMarquee() {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    trackRef.current?.style.setProperty("animation-play-state", "paused");
  };

  const handleMouseLeave = () => {
    trackRef.current?.style.setProperty("animation-play-state", "running");
  };

  const content = items.map((item, i) => (
    <span key={i} className="flex items-center">
      <span className="whitespace-nowrap px-6 text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-white/70">
        {item}
      </span>
      <span className="text-white/20" aria-hidden="true">
        ·
      </span>
    </span>
  ));

  return (
    <div
      className="overflow-hidden bg-charcoal py-4"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={trackRef}
        className="flex animate-marquee will-change-transform"
      >
        {content}
        {content}
      </div>
    </div>
  );
}
