import { Button } from "@/components/ui/Button";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Free Tools — Grade Your Site, Get Content Ideas & Request a Demo | Dreamfree",
  description:
    "Free tools for business owners: get your Signal Score, generate content ideas tailored to your business, and request a free demo homepage — all free, no obligation.",
  path: "/free-tools",
});

const tools = [
  {
    tag: "Diagnosis",
    title: "Signal Score — Grade Your Website",
    description:
      "Find out how clearly your website communicates to your ideal customer. You'll get a score out of 100, a breakdown across seven messaging elements, and your single biggest quick win. Takes 60 seconds.",
    cta: "Get Your Free Signal Score",
    modal: "signal-flow",
  },
  {
    tag: "Content",
    title: "AI Content Idea Generator",
    description:
      "Tell us about your business and your goals, and we'll generate six tailored content ideas — each with a brief, target keyword, and time estimate. Perfect for planning your next 90 days of content.",
    cta: "Generate Content Ideas",
    href: "/learning-centre/content-marketing-ideas",
  },
  {
    tag: "Risk-Free",
    title: "Free Demo Homepage",
    description:
      "We'll build a demo of what your new homepage could look like — designed, written, and fully clickable — before you spend a penny. Fill in a short questionnaire and we'll get started.",
    cta: "Request Your Free Demo",
    href: "/free-demo",
  },
];

export default function FreeToolsPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="px-[clamp(1.25rem,4vw,3rem)] pb-12 pt-32 text-center md:pt-40">
        <div className="mx-auto max-w-3xl">
          <h1
            className="text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-charcoal"
            data-reveal
          >
            Free Tools
            <br />
            <em className="font-serif font-normal italic text-teal">
              for business owners.
            </em>
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted"
            data-reveal
          >
            No account needed. No sales pitch. Just useful tools to help you
            understand your website, plan your content, and see what a better
            homepage looks like.
          </p>
        </div>
      </section>

      {/* ── TOOLS GRID ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(3rem,8vw,6rem)]">
        <div className="mx-auto max-w-[1340px] grid grid-cols-1 gap-8 md:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.title}
              className="flex flex-col justify-between rounded-2xl border border-border bg-cream p-10 transition-all duration-400 ease-smooth hover:-translate-y-[3px] hover:border-transparent hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)]"
              data-reveal
            >
              <div>
                <span className="mb-4 inline-block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-teal">
                  {tool.tag}
                </span>
                <h2 className="mb-4 text-[clamp(1.25rem,2.5vw,1.5rem)] font-bold tracking-tight text-charcoal">
                  {tool.title}
                </h2>
                <p className="text-[0.95rem] leading-[1.75] text-slate">
                  {tool.description}
                </p>
              </div>
              <div className="mt-8">
                {tool.modal ? (
                  <Button data-modal={tool.modal}>{tool.cta}</Button>
                ) : (
                  <Button href={tool.href}>{tool.cta}</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
