import { forwardRef } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";

const TAKA_FONT =
  '"Noto Sans Bengali", "Hind Siliguri", "Nirmala UI", "Bangla MN", ui-sans-serif, system-ui, sans-serif';

/**
 * Bangladeshi taka for metric cards. Uses Unicode ৳ (U+09F3) with Bengali-capable fonts
 * so it matches body copy; stroke-only “icon” shapes were misread at small sizes.
 */
export const BdTakaIcon = forwardRef<SVGSVGElement, LucideProps>(function BdTakaIcon(props, ref) {
  const { className, color: _c, size: _s, strokeWidth: _sw, absoluteStrokeWidth: _a, children: _ch, ...rest } = props;
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="currentColor"
        lang="bn"
        style={{
          fontFamily: TAKA_FONT,
          fontSize: 15,
          fontWeight: 700,
        }}
      >
        ৳
      </text>
    </svg>
  );
}) as LucideIcon;
