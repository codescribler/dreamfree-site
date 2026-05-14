"use client";

import { useState } from "react";

type State = "idle" | "loading" | "done" | "error";

export function UndoUnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<State>("idle");

  if (state === "done") {
    return (
      <p style={{ color: "#0d7377", fontSize: "14px", marginTop: "16px" }}>
        Done — you&rsquo;re back on the list. Daniel will review before any
        further emails go out.
      </p>
    );
  }

  return (
    <div style={{ marginTop: "16px" }}>
      <button
        type="button"
        disabled={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            const res = await fetch(
              "/api/email-campaigns/undo-unsubscribe",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token }),
              },
            );
            setState(res.ok ? "done" : "error");
          } catch {
            setState("error");
          }
        }}
        style={{
          background: "none",
          border: "none",
          color: "#7b7b96",
          fontSize: "13px",
          textDecoration: "underline",
          cursor: state === "loading" ? "default" : "pointer",
          padding: 0,
        }}
      >
        {state === "loading" ? "Working…" : "I unsubscribed by accident"}
      </button>
      {state === "error" && (
        <p style={{ color: "#b00", fontSize: "13px", marginTop: "8px" }}>
          Something went wrong — please email daniel@dreamfree.co.uk.
        </p>
      )}
    </div>
  );
}
