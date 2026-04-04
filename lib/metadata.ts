import type { Metadata } from "next";
import { SITE } from "./constants";

interface PageMetadataOptions {
  title: string;
  description: string;
  path: string;
  ogImage?: string;
  type?: "website" | "article";
  publishedTime?: string;
  author?: string;
}

export function buildMetadata({
  title,
  description,
  path,
  ogImage,
  type = "website",
  publishedTime,
  author,
}: PageMetadataOptions): Metadata {
  const url = `${SITE.url}${path}`;
  const image = ogImage ?? `${SITE.url}/og-default.png`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE.name,
      type: type === "article" ? "article" : "website",
      images: [{ url: image, width: 1200, height: 630 }],
      ...(publishedTime && { publishedTime }),
      ...(author && { authors: [author] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
