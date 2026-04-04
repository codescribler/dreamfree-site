import { InsightCard } from "@/components/ui/InsightCard";
import type { ArticleMeta } from "@/lib/content";

interface RelatedArticlesProps {
  articles: ArticleMeta[];
}

export function RelatedArticles({ articles }: RelatedArticlesProps) {
  if (articles.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1340px] px-[clamp(1.25rem,4vw,3rem)] pb-[clamp(5rem,12vw,10rem)]">
      <h2 className="mb-8 text-xl font-bold text-charcoal">Keep reading</h2>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((article) => (
          <InsightCard
            key={article.slug}
            href={`/${article.section}/${article.slug}`}
            tag={article.tag}
            title={article.title}
            description={article.description}
            readTime={article.readTime}
          />
        ))}
      </div>
    </section>
  );
}
