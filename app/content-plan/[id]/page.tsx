import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { buildMetadata } from "@/lib/metadata";
import { Button } from "@/components/ui/Button";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

const FORMAT_ICONS: Record<string, string> = {
  "blog article": "📝",
  "case study": "📋",
  "video script": "🎬",
  "interactive tool": "⚡",
  "email sequence": "📧",
  "social series": "📱",
  guide: "📖",
};

function getFormatIcon(format: string): string {
  const lower = format.toLowerCase();
  for (const [key, icon] of Object.entries(FORMAT_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "📄";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let name = "Your";
  try {
    const data = await convex.query(api.contentPlans.getById, {
      planId: id as Id<"contentPlans">,
    });
    if (data?.plan) {
      name = data.plan.input.name.split(" ")[0] + "'s";
    }
  } catch {
    // Fall back to generic title
  }

  return buildMetadata({
    title: `${name} 90-Day Content Plan`,
    description:
      "A personalised content marketing plan with 6 specific ideas tailored to your business, goals, and available time.",
    path: `/content-plan/${id}`,
  });
}

export default async function ContentPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let data;
  try {
    data = await convex.query(api.contentPlans.getById, {
      planId: id as Id<"contentPlans">,
    });
  } catch {
    notFound();
  }

  if (!data?.plan || data.plan.status !== "success") {
    notFound();
  }

  const { plan } = data;
  const firstName = plan.input.name.split(" ")[0];
  const planDate = new Date(plan.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-[800px] px-[clamp(1.25rem,4vw,3rem)] pt-28 pb-24">
      {/* Header */}
      <div className="mb-10 text-center" data-reveal>
        <span className="mb-3 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
          90-Day Content Plan
        </span>
        <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight text-charcoal">
          {firstName}&rsquo;s Content Marketing Plan
        </h1>
        <p className="mt-2 text-sm text-muted">
          Generated {planDate}
        </p>
      </div>

      {/* Context card */}
      <div
        className="mb-10 rounded-2xl border border-border bg-warm-grey p-8"
        data-reveal
      >
        <div className="grid gap-4 text-[0.9rem] sm:grid-cols-2">
          <div>
            <span className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
              Goal
            </span>
            <p className="mt-0.5 font-medium text-charcoal">{plan.input.goal}</p>
          </div>
          <div>
            <span className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
              Time Budget
            </span>
            <p className="mt-0.5 font-medium text-charcoal">
              {plan.input.timePerWeek} per week
            </p>
          </div>
          {plan.input.website && (
            <div>
              <span className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
                Website
              </span>
              <p className="mt-0.5 font-medium text-teal">
                {plan.input.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </p>
            </div>
          )}
          <div>
            <span className="text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-muted">
              Experience
            </span>
            <p className="mt-0.5 font-medium text-charcoal">
              {plan.input.channelsTried.join(", ") || "Starting fresh"}
            </p>
          </div>
        </div>
      </div>

      {/* Strategy summary */}
      <div className="mb-10" data-reveal>
        <h2 className="mb-3 text-lg font-bold text-charcoal">
          Your Strategy
        </h2>
        <p className="text-[1.05rem] leading-[1.85] text-slate">
          {plan.summary}
        </p>
      </div>

      {/* Ideas */}
      <div className="mb-10" data-reveal>
        <h2 className="mb-6 text-lg font-bold text-charcoal">
          Your 6 Content Ideas
        </h2>
        <div className="space-y-5">
          {plan.ideas
            .sort((a: { priority: number }, b: { priority: number }) => a.priority - b.priority)
            .map((idea: {
              priority: number;
              title: string;
              format: string;
              keyword: string;
              why: string;
              brief: string;
              timeEstimate: string;
            }) => (
              <div
                key={idea.priority}
                className="rounded-2xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-8"
              >
                {/* Priority + format badge */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-teal text-[0.75rem] font-bold text-white">
                    {idea.priority}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-warm-grey px-3 py-1 text-[0.75rem] font-semibold uppercase tracking-[0.06em] text-slate">
                    {getFormatIcon(idea.format)} {idea.format}
                  </span>
                  <span className="rounded-full bg-teal/8 px-3 py-1 text-[0.75rem] font-medium text-teal">
                    ~{idea.timeEstimate}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mb-2 text-[1.15rem] font-bold leading-snug text-charcoal">
                  {idea.title}
                </h3>

                {/* Why */}
                <p className="mb-3 text-[0.9rem] font-medium italic text-teal-deep">
                  {idea.why}
                </p>

                {/* Brief */}
                <p className="mb-4 text-[0.95rem] leading-[1.8] text-slate">
                  {idea.brief}
                </p>

                {/* Keyword */}
                <div className="flex items-center gap-2 text-[0.8rem] text-muted">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Target keyword: <span className="font-medium text-slate">{idea.keyword}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* CTA */}
      <div
        className="rounded-2xl border border-border bg-warm-grey p-8 text-center sm:p-10"
        data-reveal
      >
        <h2 className="mb-2 text-[1.25rem] font-bold text-charcoal">
          Want help executing this plan?
        </h2>
        <p className="mx-auto mb-6 max-w-md text-[0.95rem] text-slate">
          We can write the content, build the tools, and manage the whole
          strategy for you — so you can focus on running your business.
        </p>
        <Button variant="main" href="/contact">
          Book a Free Call with Daniel
        </Button>
      </div>
    </div>
  );
}
