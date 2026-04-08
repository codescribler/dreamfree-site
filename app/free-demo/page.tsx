import { Button } from "@/components/ui/Button";
import { PlanStep } from "@/components/ui/PlanStep";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { SITE } from "@/lib/constants";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Free Demo Homepage — See Your New Website Before You Pay | Dreamfree",
  description:
    "We'll build your new homepage — designed, written, fully functional — before you spend a penny. No mockups. No obligation. Request yours free.",
  path: "/free-demo",
});

export default function FreeDemoPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section className="relative overflow-hidden bg-charcoal px-[clamp(1.25rem,4vw,3rem)] py-[clamp(6rem,14vw,12rem)]">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 60% 40%, rgba(13,115,119,0.15), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-[850px] text-center">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal-bright"
            data-reveal
          >
            Zero Risk. Zero Cost.
          </span>
          <h1
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-white"
            data-reveal
          >
            We&rsquo;ll Build Your New Homepage&nbsp;&mdash;{" "}
            <em className="font-serif font-normal italic text-teal-bright">
              Free.
            </em>
          </h1>
          <p
            className="mx-auto mt-6 max-w-[55ch] text-[clamp(1.05rem,1.8vw,1.2rem)] leading-[1.75] text-white/70"
            data-reveal
          >
            Not a mockup. Not a wireframe. A real, working homepage with copy
            written specifically for your business &mdash; before you pay a
            penny.
          </p>
          <div className="mt-10 flex flex-col items-center gap-5" data-reveal>
            <Button variant="main" href="/free-demo/request">
              Request Your Free Demo
            </Button>
            <p className="text-[0.85rem] text-white/40">
              Takes 2 minutes. No card required.
            </p>
          </div>
        </div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <div className="mb-14 max-w-[900px]">
            <h2
              className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
              data-reveal
            >
              You&rsquo;ve been burned before.
              <br />
              <em className="font-serif font-normal italic text-teal">
                We get it.
              </em>
            </h2>
          </div>
          <div
            className="mb-12 grid grid-cols-1 gap-5 md:grid-cols-2"
            data-reveal
          >
            {[
              "\"I paid £3,000 for a website and it never brought in a single customer.\"",
              "\"Every web designer promises the world, then delivers a template with my logo on it.\"",
              "\"I've been through two agencies already. I don't trust the process anymore.\"",
              "\"How do I know you're any different?\"",
            ].map((quote, i) => (
              <blockquote
                key={i}
                className="rounded-r-[10px] border-l-[3px] border-teal bg-warm-grey px-8 py-6 text-[0.95rem] italic leading-[1.65] text-slate"
              >
                {quote}
              </blockquote>
            ))}
          </div>
          <p
            className="max-w-[55ch] text-[1.15rem] font-semibold text-charcoal"
            data-reveal
          >
            That&rsquo;s exactly why we build your homepage first &mdash; so you
            can see what you&rsquo;re getting before you spend anything.
          </p>
        </div>
      </section>

      {/* ── WHAT YOU GET ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            What You Get
          </span>
          <h2
            className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            A real homepage.{" "}
            <em className="font-serif font-normal italic text-teal">
              Not a sales pitch.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Custom Copy, Written for Your Business",
                text: "Not placeholder text. Not lorem ipsum. Real messaging built on The Signal Method — written to speak directly to your ideal customer.",
              },
              {
                title: "Fully Designed & Functional",
                text: "A working homepage you can click through and share. Built with real structure, real styling, and real intent.",
              },
              {
                title: "Built on a Proven Framework",
                text: "Every demo uses The Signal Method — seven pillars of clear communication that turn visitors into customers.",
              },
              {
                title: "Yours to Review, No Strings",
                text: "Love it? We'll talk about next steps. Not convinced? No invoice, no awkward follow-up. It's that simple.",
              },
              {
                title: "Tailored to Your Industry",
                text: "Whether you're in trades, healthcare, sports, or local services — we research your market before writing a word.",
              },
              {
                title: "Ready in Days, Not Weeks",
                text: "Most demos are built within a few working days. You'll get a link as soon as it's ready to review.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-white p-8"
                data-reveal
              >
                <h3 className="mb-3 text-lg font-bold text-charcoal">
                  {item.title}
                </h3>
                <p className="text-[0.95rem] leading-[1.7] text-slate">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            How It Works
          </span>
          <h2
            className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Three steps.{" "}
            <em className="font-serif font-normal italic text-teal">
              Two minutes.
            </em>
          </h2>
          <div className="mt-14">
            <PlanStep
              number={1}
              title="Fill in a Short Questionnaire"
              description="Tell us about your business, your ideal customer, and what you want your website to achieve. Takes about two minutes."
            />
            <PlanStep
              number={2}
              title="We Build Your Demo Homepage"
              description="We research your market, write the messaging using The Signal Method, and design a fully working homepage — tailored to your business."
            />
            <PlanStep
              number={3}
              title="You Review It — No Obligation"
              description="We send you a link to your demo. If you love it, we talk next steps. If not, no hard feelings — and no invoice."
            />
          </div>
          <div className="mt-12 text-center" data-reveal>
            <Button variant="main" href="/free-demo/request">
              Request Your Free Demo
            </Button>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="bg-warm-grey px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Client Results
          </span>
          <h2
            className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Don&rsquo;t take{" "}
            <em className="font-serif font-normal italic text-teal">
              our word for it.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            <TestimonialCard
              quote="Daniel didn't just build us a website — he completely reframed how we talk about what we do. Before working with Dreamfree, our site was all about us. Daniel flipped it so it was about our customers and their problems. The difference was immediate."
              author="Brent M."
              role="The Renovation Planner"
            />
            <TestimonialCard
              quote="We'd been through two web designers before Daniel. He took the time to understand who our customers are and what they care about. The site he built doesn't just look good — it brings people through the door."
              author="Mary-Ann & Emma"
              role="The Meat Hook"
            />
            <TestimonialCard
              quote="Having Dreamfree handle our site maintenance has been so helpful. They take care of all our WordPress updates and backups with minimal fuss. Their team responds quickly when needed, and our site has been running smoothly since they took over."
              author="Pierre Carion"
              role="Bite Size Safety"
            />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[850px]">
          <h2
            className="mb-12 text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Common{" "}
            <em className="font-serif font-normal italic text-teal">
              questions.
            </em>
          </h2>
          {[
            {
              q: "Is this actually free? What's the catch?",
              a: "It's genuinely free. No hidden fees, no card details, no contract. We build your demo because it's the best way to show you what we do. If you love it, we'll talk about working together. If not — you've lost nothing.",
            },
            {
              q: "How long does it take?",
              a: "Most demos are ready within a few working days. You'll get an email as soon as yours is ready to review.",
            },
            {
              q: "What if I already have a website?",
              a: "Perfect — that gives us a starting point. We'll analyse your current site, identify what's not working, and build a demo that shows what it could look like with the right messaging and structure.",
            },
            {
              q: "What if I don't like it?",
              a: "No hard feelings. There's no invoice, no obligation, and no awkward follow-up. We'd rather build something great and let it speak for itself.",
            },
            {
              q: "Why would you do this for free?",
              a: "Because telling someone their website could be better is one thing. Showing them is another. Most people who see their demo want to take it further — but that's their choice, not ours.",
            },
          ].map((faq, i) => (
            <div
              key={i}
              className="border-b border-border py-8 first:border-t"
              data-reveal
            >
              <h3 className="mb-3 text-lg font-bold text-charcoal">{faq.q}</h3>
              <p className="max-w-[55ch] text-[0.95rem] leading-[1.75] text-slate">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative overflow-hidden bg-teal py-[clamp(5rem,12vw,10rem)]">
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.06), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-[850px] px-[clamp(1.25rem,4vw,3rem)] text-center">
          <h2
            className="mb-6 text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
            data-reveal
          >
            See your new homepage{" "}
            <em className="font-serif font-normal italic text-white/85">
              before you pay a thing.
            </em>
          </h2>
          <p
            className="mx-auto mb-10 max-w-[55ch] text-[1.1rem] leading-[1.7] text-white/75"
            data-reveal
          >
            Fill in a short questionnaire and we&rsquo;ll build your demo
            homepage &mdash; designed, written, and ready to review. Free. No
            obligation.
          </p>
          <div className="flex flex-col items-center gap-5" data-reveal>
            <Button variant="main-inv" href="/free-demo/request">
              Request Your Free Demo
            </Button>
            <a
              href={SITE.phoneTel}
              className="border-b border-white/20 pb-0.5 text-[0.95rem] font-medium text-white/60 transition-all duration-300 ease-smooth hover:border-white/50 hover:text-white"
            >
              Rather talk? Call Daniel: {SITE.phone}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
