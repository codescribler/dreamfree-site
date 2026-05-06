"use client";

import type { Doc } from "@/convex/_generated/dataModel";

export function VerificationFlags({
  flags,
}: {
  flags: Doc<"emailEnrollments">["verificationFlags"];
}) {
  if (!flags) return null;
  const total =
    flags.voice.length +
    flags.loops.length +
    flags.cheese.length +
    flags.factual.length;
  if (total === 0) return null;

  return (
    <details className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-amber-900">
        {total} verification flag{total === 1 ? "" : "s"}{" "}
        <span className="text-xs font-normal text-amber-800">
          ({flags.voice.length} voice, {flags.loops.length} loops,{" "}
          {flags.cheese.length} cheese, {flags.factual.length} factual)
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {(["voice", "loops", "cheese", "factual"] as const).map((cat) =>
          flags[cat].length > 0 ? (
            <div key={cat}>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                {cat}
              </p>
              <ul className="mt-1 space-y-1">
                {flags[cat].map((f, i) => (
                  <li key={i} className="text-amber-900">
                    <span className="font-mono text-xs">{f.role}:</span>{" "}
                    {f.note}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>
    </details>
  );
}
