"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CreateKeyModal } from "./CreateKeyModal";

function formatDate(ms: number | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ApiKeysClient() {
  const keys = useQuery(api.apiKeys.listKeysWithStats);
  const revoke = useMutation(api.apiKeys.revokeKey);
  const [showCreate, setShowCreate] = useState(false);

  async function handleRevoke(id: Id<"apiKeys">, name: string) {
    if (
      !confirm(
        `Revoke API key "${name}"? This cannot be undone — the key will stop working immediately.`,
      )
    ) {
      return;
    }
    await revoke({ id });
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">API Keys</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal/90"
        >
          Create key
        </button>
      </div>

      <p className="mb-6 text-sm text-muted">
        Bearer tokens for the outbound Signal Report API. Use the value once at
        creation — only the SHA-256 hash is stored on the server.
      </p>

      {keys === undefined ? (
        <p>Loading…</p>
      ) : keys.length === 0 ? (
        <p className="text-muted">No keys yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Created</th>
              <th className="py-2 pr-4 font-medium">Last called</th>
              <th className="py-2 pr-4 font-medium">Reports</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium" />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr
                key={k._id}
                className={`border-b border-border ${k.revokedAt ? "opacity-50" : ""}`}
              >
                <td className="py-3 pr-4 font-medium">{k.name}</td>
                <td className="py-3 pr-4">{formatDate(k.createdAt)}</td>
                <td className="py-3 pr-4">{formatDate(k.lastCalledAt)}</td>
                <td className="py-3 pr-4">{k.reportCount}</td>
                <td className="py-3 pr-4">
                  {k.revokedAt ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                      Revoked
                    </span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-right">
                  {!k.revokedAt && (
                    <button
                      onClick={() => handleRevoke(k._id, k.name)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showCreate && (
        <CreateKeyModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
