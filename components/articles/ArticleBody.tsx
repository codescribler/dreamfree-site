import { MDXRemote } from "next-mdx-remote/rsc";
import { TakeawayBox } from "./TakeawayBox";
import { TableWrap } from "./TableWrap";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { ContentIdeaGenerator } from "@/components/tools/ContentIdeaGenerator";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-");
}

const mdxComponents = {
  TakeawayBox,
  TableWrap,
  EmailCapture,
  ContentIdeaGenerator,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => {
    const text =
      typeof props.children === "string" ? props.children : "";
    return (
      <h2
        id={slugify(text)}
        className="mb-4 mt-12 text-[clamp(1.25rem,2.5vw,1.65rem)] font-bold tracking-tight text-charcoal"
        {...props}
      />
    );
  },
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3
      className="mb-3 mt-8 text-[clamp(1.1rem,2vw,1.35rem)] font-bold tracking-tight text-charcoal"
      {...props}
    />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className="mb-4 max-w-none text-[1.05rem] leading-[1.85] text-slate"
      {...props}
    />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="my-4 list-disc space-y-2 pl-6" {...props} />
  ),
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className="my-4 list-decimal space-y-2 pl-6" {...props} />
  ),
  li: (props: React.HTMLAttributes<HTMLLIElement>) => (
    <li className="text-[1.05rem] leading-[1.85] text-slate" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-charcoal" {...props} />
  ),
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-8 rounded-r-[10px] border-l-[3px] border-teal bg-warm-grey px-8 py-6 text-[1.1rem] italic leading-[1.7] text-charcoal"
      {...props}
    />
  ),
  table: (props: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="my-6 overflow-x-auto rounded-[10px] border border-border">
      <table
        className="w-full border-collapse text-sm leading-relaxed"
        {...props}
      />
    </div>
  ),
  thead: (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
    <thead className="bg-warm-grey" {...props} />
  ),
  th: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className="border-b-2 border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-charcoal"
      {...props}
    />
  ),
  td: (props: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className="border-b border-border px-4 py-3 text-slate" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className="font-medium text-teal underline decoration-teal/30 underline-offset-2 transition-colors duration-300 ease-smooth hover:text-teal-deep hover:decoration-teal"
      {...props}
    />
  ),
};

interface ArticleBodyProps {
  content: string;
}

export function ArticleBody({ content }: ArticleBodyProps) {
  return (
    <div className="mx-auto max-w-[720px] px-[clamp(1.25rem,4vw,3rem)] pb-8">
      <MDXRemote source={content} components={mdxComponents} />
    </div>
  );
}
