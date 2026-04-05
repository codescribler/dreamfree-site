import Image from "next/image";
import { Hero } from "@/components/sections/Hero";
import { TrustMarquee } from "@/components/sections/TrustMarquee";
import { FinalCta } from "@/components/sections/FinalCta";
import { AmbientBlobs } from "@/components/sections/AmbientBlobs";
import { TestimonialCard } from "@/components/ui/TestimonialCard";
import { InsightCard } from "@/components/ui/InsightCard";
import { BentoCard } from "@/components/ui/BentoCard";
import { PlanStep } from "@/components/ui/PlanStep";
import { ServiceCard } from "@/components/ui/ServiceCard";
import { websiteSchema } from "@/lib/structured-data";

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteSchema()),
        }}
      />

      <Hero />
      <TrustMarquee />

      {/* ── PROBLEM ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <div className="mb-14 max-w-[900px]">
            <h2
              className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
              data-reveal
            >
              Your website looks fine.
              <br />
              <em className="font-serif font-normal italic text-teal">
                But when did it last bring you a customer?
              </em>
            </h2>
          </div>
          <div className="max-w-[70ch]" data-reveal>
            <p className="text-[clamp(1.05rem,1.8vw,1.2rem)] leading-[1.75] text-slate">
              You&rsquo;ve got a website. It loads, it looks reasonable, it has
              your phone number on it somewhere. And that&rsquo;s about all it
              does.
            </p>
            <p>
              You get most of your business through word of mouth. That&rsquo;s
              great — but you know it&rsquo;s not enough. People are searching
              for exactly what you do, landing on your website, and leaving. They
              go to a competitor. Not because the competitor is better — but
              because their website said the right things.
            </p>
            <p>
              The frustrating part? You&rsquo;ve probably spent money on a
              website before. Maybe more than once. And each time, someone
              promised it would &ldquo;generate leads.&rdquo; It didn&rsquo;t.
              It just sat there.
            </p>
          </div>
          <div
            className="mb-12 mt-12 grid grid-cols-1 gap-5 md:grid-cols-2"
            data-reveal
          >
            {[
              "\"I'm embarrassed to send people to my website — it doesn't represent what we actually do.\"",
              "\"I've paid for websites before and got nothing back.\"",
              "\"I don't know what's wrong with my site. Everyone tells me something different.\"",
              "\"I know my website is letting me down but I wouldn't know where to start.\"",
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
            Most business websites fail because they talk about the business
            instead of the customer. There&rsquo;s a better way — and it starts
            with knowing your Signal Score.
          </p>
        </div>
      </section>

      {/* ── GUIDE ── */}
      <section className="relative overflow-hidden bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <AmbientBlobs />
        <div className="mx-auto max-w-[1340px]">
          <div className="mb-16 max-w-[750px]" data-reveal>
            <span className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal">
              The Guide
            </span>
            <h2 className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal">
              We&rsquo;ve seen it
              <br />
              <em className="font-serif font-normal italic text-teal">
                hundreds of times.
              </em>
            </h2>
            <p className="mt-6 text-[clamp(1.05rem,1.8vw,1.2rem)] leading-[1.75] text-slate">
              A business owner who&rsquo;s great at what they do — reputation
              solid, customers happy — but whose website tells a completely
              different story. It talks about the business instead of the
              customer. It buries the thing that makes them different. It has no
              clear next step.
            </p>
            <p className="mt-4 text-slate">
              We get it. You&rsquo;ve been burned before. You&rsquo;re sceptical
              — and you should be. That&rsquo;s exactly why we do things
              differently.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.6fr_1fr] md:grid-rows-[auto_auto]">
            <BentoCard
              tag="Framework"
              title="A Proven Framework, Not Guesswork"
              description="Every Dreamfree website is built using The Signal Method — a five-element conversion framework that goes beyond messaging alone. Story, design, direction, diagnosis, and measurement working together. Our approach draws on Donald Miller's proven storytelling principles, but covers the full picture — because words alone don't convert."
              image="/images/framework2.png"
              imageAlt="The Signal Method — five-element conversion framework diagram"
              wide
            />
            <BentoCard
              tag="Differentiator"
              title="We Show You Before You Pay"
              description="Here's what no other agency does: we build your new homepage — designed, written, fully functional — before you've spent a penny. No mockups, no wireframes. A real, working page with real copy written for your business."
            />
            <BentoCard
              tag="Founder"
              title="Daniel Whittaker"
              description="Former Royal Marine Commando turned web strategist. The same discipline and attention to detail the military demands — applied to building websites that actually perform."
              accent
            />
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="bg-warm-grey px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Client Results
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Don&rsquo;t take
            <br />
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
              quote="We'd been through two web designers before Daniel. He took the time to understand who our customers are and what they care about. The site he built doesn't just look good — it brings people through the door. Our loyalty sign-ups increased significantly after launch."
              author="Mary-Ann & Emma"
              role="The Meat Hook"
            />
            <TestimonialCard
              quote="Having Dreamfree handle our site maintenance has been so helpful. They take care of all our WordPress updates and backups with minimal fuss. Their team responds quickly when needed, and our site has been running smoothly since they took over. It's one less thing to worry about so we can focus on our actual business."
              author="Pierre Carion"
              role="Bite Size Safety"
            />
          </div>
        </div>
      </section>

      {/* ── INSIGHTS ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            Learning Centre
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Short reads that
            <br />
            <em className="font-serif font-normal italic text-teal">
              change how you think
            </em>
            <br />
            about your website.
          </h2>
          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <InsightCard
              href="/learning-centre/headline-about-you"
              tag="Messaging"
              title="Your headline is about you. That's why nobody calls."
              description={'Most business websites open with "Welcome to [Business Name]." That\'s the equivalent of answering the phone and talking about yourself for thirty seconds. Here\'s how to flip it.'}
              readTime="5 min read"
            />
            <InsightCard
              href="/learning-centre/five-second-test"
              tag="Conversion"
              title="The 5-second test: what visitors actually see on your homepage."
              description="Show your homepage to a stranger for five seconds. Then take it away. If they can't tell you what you do and who it's for — your website is failing its only job."
              readTime="4 min read"
            />
            <InsightCard
              href="/learning-centre/testimonials-not-convincing"
              tag="Trust"
              title="Why your testimonials aren't convincing anyone."
              description={'"Great service, would recommend!" doesn\'t move the needle. Here\'s what makes a testimonial actually persuade — and where to put it so people read it before they bounce.'}
              readTime="4 min read"
            />
            <InsightCard
              href="/learning-centre/signal-score-35"
              tag="Signal Score"
              title="What a Signal Score of 35 actually means — and how to fix it."
              description="Most business websites score between 25 and 40. That's not a disaster — it's an opportunity. Here's what each of the five elements means and where to start."
              readTime="6 min read"
              highlight
            />
            <InsightCard
              href="/learning-centre/website-looks-fine"
              tag="Design"
              title='Your website looks "fine." That&rsquo;s the problem.'
              description="Fine doesn't convert. Fine doesn't build trust. Fine is what happens when design follows a template instead of a strategy. Here's the difference between a site that looks fine and one that works."
              readTime="5 min read"
            />
            <InsightCard
              href="/learning-centre/better-front-door"
              tag="Strategy"
              title="You don't need more traffic. You need a better front door."
              description="Spending money on ads when your website doesn't convert is like turning up the taps on a leaking bucket. Fix the bucket first. Here's how to tell if your site is the bottleneck."
              readTime="3 min read"
            />
          </div>
        </div>
      </section>

      {/* ── PLAN ── */}
      <section className="bg-white px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            How It Works
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Three steps.
            <br />
            <em className="font-serif font-normal italic text-teal">
              Zero risk.
            </em>
          </h2>
          <div className="mt-14">
            <PlanStep
              number={1}
              title="Get Your Free Signal Score"
              description="We score your website against five conversion essentials and give you a number out of 100 — plus your single biggest quick win. Takes 60 seconds."
            />
            <PlanStep
              number={2}
              title="Book a 15-Minute Call"
              description="We'll walk you through your report, explain what's costing you customers, and show you exactly what to fix — no obligation, no sales pitch."
            />
            <PlanStep
              number={3}
              title="Get a Free Homepage Redesign"
              description="Love what you hear? We'll redesign your homepage with new messaging built on The Signal Method — so you can see the difference before you commit to anything."
            />
          </div>
        </div>
      </section>

      {/* ── SERVICES ── */}
      <section className="bg-cream px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto max-w-[1340px]">
          <span
            className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
            data-reveal
          >
            What We Build
          </span>
          <h2
            className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
            data-reveal
          >
            Websites that
            <br />
            <em className="font-serif font-normal italic text-teal">
              actually convert.
            </em>
          </h2>
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-[1.4fr_1fr]">
            <ServiceCard
              tag="Core Service"
              title="Signal Method Website Build"
              description={'A full website built on The Signal Method. Five elements working together: story, design, direction, diagnosis, measurement. Every page structured to guide visitors from "just browsing" to "I need to call these people."'}
              hero
            />
            <ServiceCard
              tag="Diagnosis"
              title="Signal Score & Full Report"
              description="Your free Signal Score tells you where you stand. The full Signal Report (£7) gives you the complete breakdown — all five elements scored, prioritised fixes, and a messaging blueprint you can act on today."
            />
            <ServiceCard
              tag="Risk-Free"
              title="Speculative Demo"
              description="Not sure if a new website is worth it? We build one first. A fully designed homepage — sent before any sales conversation. No cost. No obligation."
            />
            <ServiceCard
              tag="Ongoing"
              title="Website Management"
              description="Monthly management — hosting, security, updates, content changes, performance monitoring. Your site stays fast, safe, and current. From £79/month."
            />
            <ServiceCard
              tag="Optimisation"
              title="Conversion Optimisation"
              description="Good website, no leads? We analyse behaviour, find drop-offs, and restructure your pages. No redesign — just smarter structure and sharper copy."
            />
            <ServiceCard
              tag="Visibility"
              title="Local SEO & Google Business"
              description="We optimise your Google Business Profile, build local citations, and structure your site so it ranks for the searches your customers actually make."
            />
          </div>
        </div>
      </section>

      {/* ── TRANSFORMATION ── */}
      <section className="relative overflow-hidden px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
        <div className="mx-auto grid max-w-[1340px] gap-12 md:grid-cols-2 md:gap-16">
          <div>
            <span
              className="mb-5 inline-block text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-teal"
              data-reveal
            >
              The Outcome
            </span>
            <h2
              className="text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.05] tracking-tighter text-charcoal"
              data-reveal
            >
              What life looks like with a website
              <br />
              <em className="font-serif font-normal italic text-teal">
                that works.
              </em>
            </h2>
            <div className="relative mt-8 aspect-[4/3] overflow-hidden rounded-2xl" data-reveal>
              <Image
                src="/images/transformation.jpg"
                alt="Before and after website transformation"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
          </div>
          <div className="flex flex-col gap-0">
            {[
              {
                title: "Your Website Works for You",
                text: "Monday morning, three new enquiries in your inbox — from people who found you online and decided you're the one to call.",
              },
              {
                title: "You're Proud to Share It",
                text: "When someone asks \"have you got a website?\" — you don't hesitate. You send the link knowing it represents the quality of your work.",
              },
              {
                title: "You Stop Losing to Worse Competitors",
                text: "Your website finally reflects the quality of your business. The competitors with flashier sites but worse service stop winning your customers.",
              },
              {
                title: "A Consistent Source of New Business",
                text: "Word of mouth plus a second channel you can actually measure. Quiet months become manageable because your website is always working.",
              },
              {
                title: "You Understand Your Own Message",
                text: "The Signal Method gives you clarity about who you serve and why you matter. That feeds into everything — conversations, proposals, confidence.",
              },
              {
                title: "A Partner, Not a Vendor",
                text: "Ongoing support, someone who understands your business, a website that evolves as you grow. No more chasing freelancers who've gone silent.",
              },
            ].map((benefit, i) => (
              <div
                key={i}
                className="border-b border-border py-6 last:border-b-0"
                data-reveal
              >
                <h4 className="mb-2 text-base font-bold text-charcoal">
                  {benefit.title}
                </h4>
                <p className="text-[0.95rem] leading-[1.7] text-slate">
                  {benefit.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STAKES ── */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/local-business.jpg')" }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-charcoal/85" />
        <div className="relative px-[clamp(1.25rem,4vw,3rem)] py-[clamp(5rem,12vw,10rem)]">
          <div className="mx-auto max-w-[720px]">
            <h2
              className="mb-8 text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
              data-reveal
            >
              What happens
              <br />
              if you do <em className="font-serif italic text-white/85">
                nothing?
              </em>
            </h2>
            <div className="space-y-4 text-[1.05rem] leading-[1.85] text-white/75" data-reveal>
              <p className="max-w-none">
                <strong className="font-semibold text-white">
                  Every month, your website costs you customers you&rsquo;ll
                  never know about.
                </strong>{" "}
                People search for your services, land on your site, don&rsquo;t
                see what they need in five seconds, and leave. They go to a
                competitor — not because the competitor is better, but because
                their website communicated more clearly.
              </p>
              <p className="max-w-none">
                You keep relying on word of mouth. Which works — until it
                doesn&rsquo;t. Referrals are unpredictable. Quiet months hit and
                there&rsquo;s no pipeline to fall back on.
              </p>
              <p className="max-w-none">
                You blend in with everyone else. Same stock photos, same generic
                copy, same &ldquo;we&rsquo;re passionate about
                excellence.&rdquo; Nothing that makes someone think:{" "}
                <em>&ldquo;These are the ones.&rdquo;</em>
              </p>
              <p className="max-w-none">
                <strong className="font-semibold text-white">
                  The longer you wait, the more it costs.
                </strong>{" "}
                Not in website fees — in lost opportunities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <FinalCta />
    </>
  );
}
