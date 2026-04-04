import { getArticlesBySection } from "@/lib/content";
import { buildMetadata } from "@/lib/metadata";
import { PageHero } from "@/components/sections/PageHero";
import { FinalCta } from "@/components/sections/FinalCta";
import { CourseBanner } from "@/components/sections/CourseBanner";
import { FeaturedCard } from "@/components/ui/FeaturedCard";
import { InsightCard } from "@/components/ui/InsightCard";

export const metadata = buildMetadata({
  title: "Learning Centre — Website Strategy, Cost & Conversion",
  description:
    "Straight-talking articles about website strategy, messaging, cost, and conversion. Everything you need to make better decisions about your business website.",
  path: "/learning-centre",
});

export default function LearningCentreHub() {
  const articles = getArticlesBySection("learning-centre");
  const featured = articles.filter((a) => a.featured);
  const rest = articles.filter((a) => !a.featured);

  return (
    <>
      <PageHero
        title="Everything you need to know about"
        titleAccent="websites that actually work."
        subtitle="Strategy, messaging, cost, conversion, trust. No jargon, no upsell — just practical articles that help you make better decisions about your business website."
      />

      {featured.length > 0 && (
        <section className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] pb-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {featured.map((article) => (
              <FeaturedCard
                key={article.slug}
                href={`/learning-centre/${article.slug}`}
                tag={article.tag}
                title={article.title}
                description={article.description}
                readTime={article.readTime}
              />
            ))}
          </div>
        </section>
      )}

      <CourseBanner />

      <section className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] pb-[clamp(5rem,12vw,10rem)]">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((article) => (
            <InsightCard
              key={article.slug}
              href={`/learning-centre/${article.slug}`}
              tag={article.tag}
              title={article.title}
              description={article.description}
              readTime={article.readTime}
            />
          ))}
        </div>
      </section>

      <FinalCta />
    </>
  );
}
