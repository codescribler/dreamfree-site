"use client";

import { useRef } from "react";

const ANON_KEY = "df_anonymous_id";
const SESSION_KEY = "df_session_id";

function getOrCreate(storage: Storage, key: string): string {
  const existing = storage.getItem(key);
  if (existing) return existing;
  const id = crypto.randomUUID();
  storage.setItem(key, id);
  return id;
}

/**
 * Returns a stable anonymous ID (persisted in localStorage)
 * and a session ID (persisted in sessionStorage, resets per tab).
 */
export function useAnonymousId() {
  const ids = useRef<{ anonymousId: string; sessionId: string } | null>(null);

  if (typeof window === "undefined") {
    return { anonymousId: "", sessionId: "" };
  }

  if (!ids.current) {
    ids.current = {
      anonymousId: getOrCreate(localStorage, ANON_KEY),
      sessionId: getOrCreate(sessionStorage, SESSION_KEY),
    };
  }

  return ids.current;
}
