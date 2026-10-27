"use client";

import { useState } from "react";
import { PhoneFrame } from "@/components/shared/PhoneFrame";
import type { Lang } from "@/lib/i18n";
import { Chat } from "./Chat";

const CHANNELS = [
  {
    name: "Telegram",
    note: "Answers in your shop's bot or group",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[26px]" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ed9" /><path d="M5.5 11.8l11-4.3c.5-.2 1 .1.8.9l-1.9 8.8c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-2.9 5.3-4.8c.2-.2 0-.3-.3-.1l-6.6 4.1-2.8-.9c-.6-.2-.6-.6.2-.8z" fill="#fff" /></svg>
    ),
  },
  {
    name: "Messenger",
    note: "Replies to your Facebook Page",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[26px]" aria-hidden="true"><defs><linearGradient id="mg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#0866ff" /><stop offset="1" stopColor="#a033ff" /></linearGradient></defs><path d="M12 1.5C6 1.5 1.5 5.9 1.5 11.6c0 3 1.2 5.6 3.3 7.4v3.5l3.2-1.8c1.2.3 2.6.5 4 .5 6 0 10.5-4.4 10.5-10.1S18 1.5 12 1.5z" fill="url(#mg)" /><path d="m5.6 14.6 3.2-5 3 2.3 3.6-2.4-3.2 5-3-2.3z" fill="#fff" /></svg>
    ),
  },
  {
    name: "Your website",
    note: "The chat you're using now",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[26px]" fill="none" stroke="#141a15" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M3 9h18" /></svg>
    ),
  },
];

const BUILT_IN = ["Real stock and prices", "Delivery zones and fees", "Orders + KHQR payment", "Hands over to you anytime"];

/** The Shop Assistant page: chat in a phone on the right (first, full screen on phones), how it works on the left. */
export function ShopAssistant() {
  const [lang, setLang] = useState<Lang>("en");
  return (
    <main className="mx-auto max-w-[1240px] lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-[34px] lg:px-[30px] lg:py-[26px]">
      <div className="md:flex md:justify-center md:pt-6 lg:order-2 lg:pt-0">
        <PhoneFrame className="h-[calc(100dvh-36px)] md:h-[760px] md:max-h-[calc(100dvh-84px)] md:w-[400px] lg:h-[680px] lg:w-[340px]">
          <Chat lang={lang} onLang={setLang} />
        </PhoneFrame>
      </div>

      <section className="px-[18px] py-8 sm:px-[22px] md:mx-auto md:max-w-[720px] lg:order-1 lg:max-w-none lg:p-0 lg:pt-2">
        <p className="text-[12px] font-semibold text-accent">Shop Assistant demo</p>
        <h1 className="mt-1.5 max-w-[22ch] text-[clamp(27px,3.4vw,34px)] leading-[1.04] font-semibold tracking-[-0.045em]">A salesperson that never sleeps, in Khmer and English.</h1>
        <p className="mt-3 max-w-[52ch] text-[14.5px] text-muted">
          Ask it anything about Mealea Fashion. It checks real stock, quotes delivery and takes the order, then sends a KHQR to pay.
        </p>

        <h2 className="mt-7 text-[13px] font-semibold">How it connects</h2>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <div key={c.name} className="flex items-center gap-3 rounded-[16px] border border-line bg-surface p-3.5 sm:block">
              {c.icon}
              <div>
                <div className="text-[13.5px] font-semibold sm:mt-2">{c.name}</div>
                <div className="text-[12px] text-muted">{c.note}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-4 rounded-[18px] bg-ink p-4 text-[12.5px] text-ink-fg sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[11.5px] text-ink-muted">What the owner gets on Telegram</div>
            <div className="rounded-[4px_14px_14px_14px] bg-[#1d241e] px-3 py-2.5 leading-[1.55]">
              <b>New order · $19.50</b>
              <br />
              Linen shirt · Black · M
              <br />
              Delivery Toul Kork · today
              <br />
              <span className="font-semibold text-ink-accent">Paid by KHQR</span>
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11.5px] text-ink-muted">Built in</div>
            <ul className="leading-[1.9]">
              {BUILT_IN.map((b) => <li key={b}>{b}</li>)}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
