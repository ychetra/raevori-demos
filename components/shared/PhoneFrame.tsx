import type { ReactNode } from "react";

/** Ink phone bezel on tablets and desktops; on phones the content is full-bleed. */
export function PhoneFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`md:rounded-[44px] md:bg-[#141a15] md:p-[9px] md:shadow-[0_30px_60px_-28px_rgba(20,26,21,0.6)] ${className}`}>
      <div className="relative h-full overflow-hidden bg-surface md:rounded-[35px]">{children}</div>
    </div>
  );
}
