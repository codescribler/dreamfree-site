import Image from "next/image";

interface BentoCardProps {
  tag: string;
  title: string;
  description: string;
  image?: string;
  imageAlt?: string;
  accent?: boolean;
  wide?: boolean;
  tall?: boolean;
}

export function BentoCard({
  tag,
  title,
  description,
  image,
  imageAlt,
  accent = false,
  wide = false,
  tall = false,
}: BentoCardProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-10 transition-all duration-400 ease-smooth ${
        accent
          ? "border-transparent bg-charcoal text-[rgba(232,232,240,0.8)] hover:-translate-y-[3px] hover:shadow-[0_16px_48px_rgba(0,0,0,0.2)]"
          : "border-border bg-white hover:-translate-y-[3px] hover:border-transparent hover:shadow-[0_16px_48px_rgba(13,115,119,0.08),0_4px_12px_rgba(0,0,0,0.04)]"
      } ${wide ? "md:col-span-1 md:row-span-2" : ""} ${tall ? "md:row-span-1" : ""}`}
      data-reveal
    >
      <span
        className={`mb-5 inline-block rounded-[20px] px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] ${
          accent ? "bg-teal text-white" : "bg-teal-glow text-teal"
        }`}
      >
        {tag}
      </span>
      <h3
        className={`mb-4 text-[clamp(1.25rem,2.5vw,1.65rem)] font-bold tracking-tight ${
          accent ? "text-white" : "text-charcoal"
        }`}
      >
        {title}
      </h3>
      <p
        className={`text-[0.95rem] leading-[1.7] ${
          accent ? "text-[rgba(232,232,240,0.8)]" : "text-slate"
        }`}
      >
        {description}
      </p>
      {image && (
        <Image
          src={image}
          alt={imageAlt ?? ""}
          width={600}
          height={280}
          className="-mx-10 -mb-10 mt-8 w-[calc(100%+5rem)] max-h-[280px] object-cover"
        />
      )}
    </div>
  );
}
