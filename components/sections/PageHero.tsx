interface PageHeroProps {
  title: string;
  titleAccent?: string;
  subtitle?: string;
}

export function PageHero({ title, titleAccent, subtitle }: PageHeroProps) {
  return (
    <section className="px-[clamp(1.25rem,4vw,3rem)] pb-12 pt-32 text-center md:pt-40">
      <div className="mx-auto max-w-3xl">
        <h1
          className="text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-charcoal"
          data-reveal
        >
          {title}
          {titleAccent && (
            <>
              <br />
              <em className="font-serif font-normal italic text-teal">
                {titleAccent}
              </em>
            </>
          )}
        </h1>
        {subtitle && (
          <p
            className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted"
            data-reveal
          >
            {subtitle}
          </p>
        )}
      </div>
    </section>
  );
}
