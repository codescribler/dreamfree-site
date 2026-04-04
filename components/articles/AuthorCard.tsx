import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/constants";

export function AuthorCard() {
  return (
    <div className="mx-auto max-w-[720px] border-t border-border px-[clamp(1.25rem,4vw,3rem)] py-8">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full">
          <Image
            src="/images/daniel-avatar.jpg"
            alt={SITE.owner}
            width={135}
            height={240}
            className="h-full w-full object-cover object-[50%_15%]"
          />
        </div>
        <div>
          <p className="text-sm font-bold text-charcoal">{SITE.owner}</p>
          <p className="mt-0.5 text-xs text-muted">{SITE.ownerTitle}</p>
          <Link
            href="/about"
            className="mt-2 inline-block text-xs font-semibold text-teal transition-colors duration-300 ease-smooth hover:text-teal-deep"
          >
            About Daniel &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
