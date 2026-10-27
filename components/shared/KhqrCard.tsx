"use client";

import { pick, type Lang } from "@/lib/i18n";
import { usd } from "@/lib/money";
import { KHQR_DEMO_VALUE } from "./khqr";
import { SHARED } from "./km";
import { Qr } from "./Qr";

/** KHQR look-alike payment card with a "Simulate payment" button. No real payment code is ever shown. */
export function KhqrCard({ amount, merchant, lang, onPaid, busy = false }: { amount: number; merchant: string; lang: Lang; onPaid: () => void; busy?: boolean }) {
  return (
    <div className="flex flex-col items-stretch">
      <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_14px_30px_-18px_rgba(0,0,0,0.35)]">
        <div className="relative bg-khqr px-4 py-3 text-white">
          <b className="text-[17px] tracking-[0.04em]">KHQR</b>
          <span aria-hidden="true" className="absolute right-0 -bottom-px size-0 border-b-[22px] border-l-[22px] border-b-white border-l-transparent" />
        </div>
        <div className="px-[18px] pt-3.5 pb-1.5">
          <div className="text-[12px] text-muted">{merchant}</div>
          <div className="text-[26px] font-bold tracking-[-0.03em] tabular-nums">
            {amount.toFixed(2)} <span className="text-[13px] font-medium">USD</span>
          </div>
        </div>
        <div className="my-2 border-t-[1.5px] border-dashed border-[#e3d6d6]" />
        <div className="px-[18px] pt-1.5 pb-[18px]">
          <Qr value={KHQR_DEMO_VALUE} label={`${pick(SHARED.scanLabel, lang)} ${merchant}, ${usd(amount)}`} className="mx-auto w-[min(170px,60vw)]" />
        </div>
      </div>
      <button
        type="button"
        onClick={onPaid}
        disabled={busy}
        lang={lang}
        className="mt-4 min-h-12 rounded-[14px] bg-fg px-4 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pick(SHARED.simulate, lang)}
      </button>
      <p lang={lang} className="mt-2 text-center text-[11.5px] text-muted">{pick(SHARED.demoNote, lang)}</p>
    </div>
  );
}
