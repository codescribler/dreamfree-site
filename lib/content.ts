import fs from "fs";
import path from "path";
import matter from "gray-matter";

const contentDir = path.join(process.cwd(), "content");

export interface ArticleFrontmatter {
  title: string;
  description: string;
  tag: string;
  date: string;
  readTime: string;
  featured: boolean;
  author: string;
  takeaway: string;
  relatedSlugs: string[];
}

export interface ArticleMeta extends ArticleFrontmatter {
  slug: string;
  section: string;
}

export interface Article extends ArticleMeta {
  content: string;
}

function getArticlesDir(section: string): string {
  return path.join(contentDir, section);
}

export function getArticleSlugs(section: string): string[] {
  const dir = getArticlesDir(section);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getArticle(section: string, slug: string): Article {
  const filePath = path.join(getArticlesDir(section), `${slug}.mdx`);
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  return {
    ...(data as ArticleFrontmatter),
    slug,
    section,
    content,
  };
}

export function getArticlesBySection(section: string): ArticleMeta[] {
  const slugs = getArticleSlugs(section);
  return slugs
    .map((slug) => {
      const filePath = path.join(getArticlesDir(section), `${slug}.mdx`);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);
      return { ...(data as ArticleFrontmatter), slug, section };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getArticlesByTag(
  section: string,
  tag: string
): ArticleMeta[] {
  return getArticlesBySection(section).filter((a) => a.tag === tag);
}

export function getFeaturedArticle(
  section: string
): ArticleMeta | undefined {
  return getArticlesBySection(section).find((a) => a.featured);
}

export function getAllArticles(): ArticleMeta[] {
  return getArticlesBySection("learning-centre");
}
