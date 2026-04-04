"use client";

import { useState, useEffect } from "react";

interface ScoreRingProps {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 200 }: ScoreRingProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (displayScore / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const duration = 1500;
      const stepTime = duration / score;
      const counter = setInterval(() => {
        current++;
        setDisplayScore(current);
        if (current >= score) clearInterval(counter);
      }, stepTime);
    }, 300);
    return () => clearTimeout(timer);
  }, [score]);

  const color =
    score < 35 ? "#e8655a" : score < 60 ? "#d4943a" : "#0d7377";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-full w-full -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e1dc"
          strokeWidth="6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          className="transition-[stroke-dashoffset] duration-[1.5s] ease-smooth"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-black text-charcoal">
          {displayScore}
        </span>
        <span className="text-sm text-muted">/100</span>
      </div>
    </div>
  );
}
