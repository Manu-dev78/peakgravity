import { cn } from "@/lib/utils";

/** PeakGravity mark — a sharp peak with a floating (anti-gravity) base line. */
export function Logo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="PeakGravity"
    >
      <path
        d="M32 6 L54 50 H44 L32 25 L20 50 H10 Z"
        fill="currentColor"
      />
      <path d="M22 56 H42" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
