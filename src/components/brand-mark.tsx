import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

type BrandMarkProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
  nameClassName?: string;
};

const sizeMap = {
  sm: {
    image: "h-9 w-9",
    title: "text-[15px]",
    tagline: "text-[10px]",
  },
  md: {
    image: "h-11 w-11",
    title: "text-lg",
    tagline: "text-[11px]",
  },
  lg: {
    image: "h-14 w-14",
    title: "text-2xl",
    tagline: "text-[12px]",
  },
} as const;

function BrandInner({
  size = "sm",
  showTagline = false,
  className,
  nameClassName,
}: Omit<BrandMarkProps, "href">) {
  const cfg = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-[18px] border border-amber-200/60 bg-[radial-gradient(circle_at_top,#fff8d1,#ffe27a_58%,#f8b735_100%)] shadow-[0_16px_36px_rgba(245,158,11,0.28)]",
          cfg.image
        )}
      >
        <Image
          src="/brand/echonest-mascot.png"
          alt="EchoNest mascot"
          fill
          className="object-contain p-1"
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold tracking-tight text-slate-950",
            cfg.title,
            nameClassName
          )}
          style={{ fontFamily: "var(--font-display)" }}
        >
          EchoNest
        </p>
        {showTagline && (
          <p className={cn("uppercase tracking-[0.22em] text-slate-500", cfg.tagline)}>
            Living Knowledge Characters
          </p>
        )}
      </div>
    </div>
  );
}

export function BrandMark(props: BrandMarkProps) {
  if (props.href) {
    return (
      <Link href={props.href} className="inline-flex">
        <BrandInner {...props} />
      </Link>
    );
  }

  return <BrandInner {...props} />;
}
