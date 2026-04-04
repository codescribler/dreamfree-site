import {
  getArticle,
  getArticleSlugs,
  getArticlesBySection,
} from "@/lib/content";
import type { ArticleMeta } from "@/lib/content";
import { ArticleHeader } from "@/components/articles/ArticleHeader";
import { ArticleBody } from "@/components/articles/ArticleBody";
import { TakeawayBox } from "@/components/articles/TakeawayBox";
import { AuthorCard } from "@/components/articles/AuthorCard";
import { RelatedArticles } from "@/components/articles/RelatedArticles";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { CourseBanner } from "@/components/sections/CourseBanner";
import { FinalCta } from "@/components/sections/FinalCta";
import { buildMetadata } from "@/lib/metadata";
import { articleSchema, breadcrumbSchema } from "@/lib/structured-data";
import { SITE } from "@/lib/constants";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getArticleSlugs("learning-centre").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  try {
    const article = getArticle("learning-centre", slug);
    return buildMetadata({
      title: article.title,
      description: article.description,
      path: `/learning-centre/${slug}`,
      type: "article",
      publishedTime: article.date,
      author: article.author,
    });
  } catch {
    return {};
  }
}

export default async function LearningCentreArticlePage({ params }: Props) {
  const { slug } = await params;

  let article;
  try {
    article = getArticle("learning-centre", slug);
  } catch {
    notFound();
  }

  const allArticles = getArticlesBySection("learning-centre");
  const related = article.relatedSlugs
    .map((s) => allArticles.find((a) => a.slug === s))
    .filter((a): a is ArticleMeta => a !== undefined)
    .slice(0, 3);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleSchema({
              title: article.title,
              description: article.description,
              url: `${SITE.url}/learning-centre/${slug}`,
              datePublished: article.date,
              author: article.author,
            })
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbSchema([
              { name: "Home", url: SITE.url },
              {
                name: "Learning Centre",
                url: `${SITE.url}/learning-centre`,
              },
              {
                name: article.title,
                url: `${SITE.url}/learning-centre/${slug}`,
              },
            ])
          ),
        }}
      />
      <ArticleHeader
        tag={article.tag}
        title={article.title}
        readTime={article.readTime}
        date={article.date}
      />
      <ArticleBody content={article.content} />
      <div className="mx-auto max-w-[720px] px-[clamp(1.25rem,4vw,3rem)]">
        <TakeawayBox>{article.takeaway}</TakeawayBox>
      </div>
      <AuthorCard />
      <EmailCapture
        heading="Found this useful?"
        subtext="Get one practical read like this every fortnight. No spam."
      />
      <CourseBanner compact />
      <RelatedArticles articles={related} />
      <FinalCta />
    </>
  );
}
