"use client";

import { useBubblePhysics } from "@/hooks/useBubblePhysics";

const BUBBLES = [
  { width: "clamp(180px, 22vw, 340px)", height: "clamp(180px, 22vw, 340px)" },
  { width: "clamp(120px, 15vw, 240px)", height: "clamp(120px, 15vw, 240px)" },
  { width: "clamp(220px, 28vw, 420px)", height: "clamp(220px, 28vw, 420px)" },
  { width: "clamp(90px, 10vw, 160px)", height: "clamp(90px, 10vw, 160px)" },
];

export function HeroBubbles() {
  const containerRef = useBubblePhysics();

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      {BUBBLES.map((bubble, i) => (
        <div
          key={i}
          data-bubble
          className="rounded-full border-[1.5px] border-teal/15 backdrop-blur-[2px]"
          style={{
            width: bubble.width,
            height: bubble.height,
            background:
              "radial-gradient(circle at 30% 30%, rgba(13,115,119,0.1), rgba(13,115,119,0.03) 60%, transparent 80%)",
            boxShadow:
              "inset 0 0 40px rgba(13,115,119,0.06), 0 8px 32px rgba(13,115,119,0.04)",
          }}
        />
      ))}
    </div>
  );
}
