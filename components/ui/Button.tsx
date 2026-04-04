import Link from "next/link";

type ButtonVariant = "main" | "main-inv" | "ghost" | "inline";

interface ButtonProps {
  variant?: ButtonVariant;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit";
  "data-modal"?: string;
}

const variantStyles: Record<ButtonVariant, string> = {
  main: [
    "bg-teal text-white",
    "hover:-translate-y-0.5",
    "hover:shadow-[0_12px_32px_rgba(13,115,119,0.3),0_4px_8px_rgba(13,115,119,0.15)]",
    "active:translate-y-0 active:scale-[0.98]",
    // Gradient overlay on hover
    "before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/15 before:to-transparent before:opacity-0 before:transition-opacity before:duration-400 before:ease-smooth",
    "hover:before:opacity-100",
  ].join(" "),

  "main-inv": [
    "bg-white text-charcoal",
    "hover:-translate-y-0.5",
    "hover:shadow-[0_12px_32px_rgba(0,0,0,0.15),0_4px_8px_rgba(0,0,0,0.08)]",
    "active:translate-y-0 active:scale-[0.98]",
  ].join(" "),

  ghost: [
    "border-[1.5px] border-border text-charcoal font-medium",
    "hover:border-teal hover:text-teal hover:-translate-y-0.5",
  ].join(" "),

  inline: [
    "text-teal font-semibold !px-0 !py-0 !rounded-none !gap-1.5",
    "mt-4 text-[0.9rem]",
    "hover:gap-3",
  ].join(" "),
};

const baseStyles = [
  "relative inline-flex items-center gap-3 overflow-hidden",
  "rounded-[60px] px-8 py-4 text-[0.95rem] font-semibold",
  "transition-all duration-400 ease-smooth",
].join(" ");

function ArrowIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="transition-transform duration-300 ease-smooth group-hover:translate-x-1"
    >
      <path
        d="M4 10h12m0 0l-4-4m4 4l-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Button({
  variant = "main",
  href,
  onClick,
  children,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  const showArrow = variant === "main" || variant === "main-inv";
  const showInlineArrow = variant === "inline";
  const styles = `group ${baseStyles} ${variantStyles[variant]} ${className}`;

  const content = (
    <>
      <span>{children}</span>
      {showArrow && <ArrowIcon />}
      {showInlineArrow && (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="transition-transform duration-300 ease-smooth group-hover:translate-x-1"
        >
          <path
            d="M3 8h10m0 0l-3-3m3 3l-3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  );

  if (href) {
    const isExternal =
      href.startsWith("http") ||
      href.startsWith("tel:") ||
      href.startsWith("mailto:");

    if (isExternal) {
      return (
        <a href={href} className={styles} {...props}>
          {content}
        </a>
      );
    }

    return (
      <Link href={href} className={styles} {...props}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={styles} {...props}>
      {content}
    </button>
  );
}
