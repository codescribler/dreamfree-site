"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { isLocalDev } from "@/lib/is-local-dev";

type TrackArgs = Parameters<
  ReturnType<typeof useMutation<typeof api.events.track>>
>[0];

/**
 * Returns a function that records an event in the Convex `events` table —
 * but no-ops when running on localhost / `next dev`. Use this everywhere
 * instead of calling useMutation(api.events.track) directly.
 */
export function useTrackEvent() {
  const track = useMutation(api.events.track);
  return useCallback(
    (args: TrackArgs) => {
      if (isLocalDev()) return Promise.resolve(undefined);
      return track(args);
    },
    [track],
  );
}
