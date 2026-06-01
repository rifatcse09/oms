import { cn } from "@/lib/utils";
import { useBrand } from "../context/BrandContext";

type BrandLogoProps = {
  className?: string;
  /**
   * Graphic mark (cow mark). Use only where a full lockup is required.
   * Invoices and challans use the same public asset path as this img (via BASE_URL).
   */
  showMark?: boolean;
  /** Narrow header bar: shorter type, tagline only from `sm` up. */
  compact?: boolean;
};

/** Text-first brand block. Optional `showMark` for rare full lockups outside print templates. */
export function BrandLogo({
  className = "",
  showMark = false,
  compact = false,
}: BrandLogoProps) {
  const { brand } = useBrand();
  const logoSrc = brand.logoUrl ?? `${import.meta.env.BASE_URL}hmc-logo.png`;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        showMark && "gap-3",
        className,
      )}
    >
      {showMark ? (
        <img
          src={logoSrc}
          alt=""
          className={cn(
            "w-auto shrink-0 object-contain",
            compact ? "h-8 sm:h-9" : "h-12 sm:h-14",
          )}
        />
      ) : null}
      <div className="min-w-0">
        <p
          className={cn(
            "font-bold leading-tight text-brand-dark",
            compact ? "text-sm sm:text-base" : "text-lg md:text-xl",
          )}
        >
          {brand.companyNameEn}
        </p>
        <p
          className={cn(
            "font-bn leading-snug text-brand-muted",
            compact
              ? "mt-0.5 hidden text-[10px] sm:block sm:text-xs"
              : "mt-0.5 text-xs",
          )}
        >
          {brand.companyNameBn} — FRESH GROCERIES EVERYDAY
        </p>
      </div>
    </div>
  );
}
