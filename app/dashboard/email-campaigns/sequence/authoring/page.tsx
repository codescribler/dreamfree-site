"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  ROLES,
  ROLE_LABELS,
  type Role,
} from "@/lib/email-campaigns/roles";
import {
  buildVoiceSpecPrompt,
  buildRolePrompt,
} from "@/lib/email-campaigns/authoring-prompts";
import { SequenceTabs } from "../SequenceTabs";

type AuthoringTab = "voice" | Role;

const SUB_TABS: { key: AuthoringTab; label: string }[] = [
  { key: "voice", label: "Voice spec" },
  ...ROLES.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
  })),
];

function AuthoringPageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const subTab = (params.get("step") ?? "voice") as AuthoringTab;

  const sequence = useQuery(api.emailCampaigns.getActiveSequence);
  const briefs = useQuery(
    api.emailCampaigns.getCurrentBriefs,
    sequence ? { sequenceId: sequence._id } : "skip",
  );
  const voiceSpec = useQuery(api.emailCampaigns.getCurrentVoiceSpec);

  const briefsByRole = useMemo(() => {
    const map = {} as Record<Role, Doc<"emailRoleBriefs">>;
    if (briefs) {
      for (const b of briefs) {
        map[b.role as Role] = b;
      }
    }
    return map;
  }, [briefs]);

  function setSubTab(next: AuthoringTab) {
    const qs = new URLSearchParams(params);
    qs.set("step", next);
    router.push(`${pathname}?${qs.toString()}`);
  }

  const ready = sequence !== undefined && briefs !== undefined && voiceSpec !== undefined;

  const prompt = useMemo(() => {
    if (!ready) return "";
    if (subTab === "voice") {
      return buildVoiceSpecPrompt();
    }
    return buildRolePrompt(
      subTab,
      voiceSpec?.body ?? "",
      Object.fromEntries(
        ROLES.map((role) => [
          role,
          { workedExample: briefsByRole[role]?.workedExample ?? "" },
        ]),
      ) as Record<Role, { workedExample: string }>,
    );
  }, [ready, subTab, voiceSpec?.body, briefsByRole]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-charcoal">Authoring helper</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Generate a context-rich prompt for each building block of the
          sequence. Copy the prompt, paste into a Claude chat, have a real
          conversation to draft the content, then paste the result back into
          the briefs / voice spec editor.
        </p>
      </header>

      <SequenceTabs active="authoring" />

      <SubTabStrip activeKey={subTab} onChange={setSubTab} />

      {!ready ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <PromptPanel
          subTab={subTab}
          prompt={prompt}
          voiceSpec={voiceSpec}
          activeBrief={subTab !== "voice" ? briefsByRole[subTab] : undefined}
        />
      )}
    </div>
  );
}

function SubTabStrip({
  activeKey,
  onChange,
}: {
  activeKey: AuthoringTab;
  onChange: (next: AuthoringTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-warm-grey p-1">
      {SUB_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
            t.key === activeKey
              ? "bg-white text-charcoal shadow-sm"
              : "text-muted hover:text-charcoal"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function PromptPanel({
  subTab,
  prompt,
  voiceSpec,
  activeBrief,
}: {
  subTab: AuthoringTab;
  prompt: string;
  voiceSpec: Doc<"emailVoiceSpec"> | null | undefined;
  activeBrief: Doc<"emailRoleBriefs"> | undefined;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignored — fallback below
    }
  }

  return (
    <div className="space-y-4">
      <PromptHeader
        subTab={subTab}
        voiceSpec={voiceSpec}
        activeBrief={activeBrief}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:bg-teal-deep"
        >
          {copied ? "Copied!" : "Copy prompt"}
        </button>
        <a
          href="https://claude.ai/new"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-teal hover:underline"
        >
          Open Claude.ai →
        </a>
        <span className="text-xs text-muted">
          {prompt.length.toLocaleString()} characters
        </span>
      </div>

      <div className="rounded-xl border border-border bg-white">
        <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-charcoal">
          {prompt}
        </pre>
      </div>
    </div>
  );
}

function PromptHeader({
  subTab,
  voiceSpec,
  activeBrief,
}: {
  subTab: AuthoringTab;
  voiceSpec: Doc<"emailVoiceSpec"> | null | undefined;
  activeBrief: Doc<"emailRoleBriefs"> | undefined;
}) {
  if (subTab === "voice") {
    return (
      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-base font-bold text-charcoal">
          Voice spec — author Daniel&rsquo;s voice
        </h2>
        <p className="mt-1 text-sm text-muted">
          The voice spec is the system prompt the LLM uses every time it
          rewrites an email. This is the single biggest determinant of whether
          generated emails sound like Daniel or like generic LLM register.
          Author this first — every other building block depends on it.
        </p>
        {voiceSpec && (
          <p className="mt-2 text-xs text-muted">
            Currently saved: voice spec v{voiceSpec.version}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <h2 className="text-base font-bold text-charcoal">
        {ROLE_LABELS[subTab]} — worked example
      </h2>
      <p className="mt-1 text-sm text-muted">
        The worked example is loaded into the generation prompt every time the
        LLM writes this email for a real prospect. It anchors the role&rsquo;s
        tone and structure. Author this in your own voice; the LLM personalises
        per-recipient at send time.
      </p>
      {activeBrief && (
        <p className="mt-2 text-xs text-muted">
          Currently saved brief: v{activeBrief.version}.
          {activeBrief.workedExample.includes("[FILL IN") && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              Worked example is still a placeholder
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export default function AuthoringPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <AuthoringPageInner />
    </Suspense>
  );
}
