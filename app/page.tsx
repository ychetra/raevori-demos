import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { T as SA } from "@/features/shop-assistant/km";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <>
      <DemoBar home />
      <main className="mx-auto max-w-[1240px] px-[18px] pt-8 pb-12 sm:px-[34px] sm:pt-[34px]">
        <h1 className="max-w-[16ch] text-[clamp(30px,4vw+14px,40px)] leading-none font-semibold tracking-[-0.05em]">
          Don&apos;t read about it. Try it on your phone.
        </h1>
        <p className="mt-3 mb-6 text-[14px] text-muted sm:text-[15px]">
          Two real products built by Raevori Studio in Phnom Penh. Both work in Khmer and English.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <DemoCard
            href="/table-order"
            title="Table Order"
            line="QR menu, KHQR checkout and a live kitchen screen. For cafés and restaurants."
            preview={<TableOrderPreview />}
          />
          <DemoCard
            href="/shop-assistant"
            title="Shop Assistant"
            line="AI that sells in Khmer and English, from real stock. For Facebook and Telegram shops."
            preview={<ShopAssistantPreview />}
          />
        </div>

        <p className="mt-8 text-[13px] text-muted">
          Built by Raevori Studio, Phnom Penh. Want one for your business?{" "}
          <a href="https://raevori.com/#contact" className="font-medium whitespace-nowrap text-fg underline-offset-4 hover:underline">
            Talk to us →
          </a>
        </p>
      </main>
    </>
  );
}

function DemoCard({ href, title, line, preview }: { href: string; title: string; line: string; preview: ReactNode }) {
  return (
    <a
      href={href}
      // Inline radius: the global :focus-visible rule would otherwise square the corners to 6px.
      style={{ borderRadius: 22 }}
      className="group block overflow-hidden border border-line bg-surface transition-[transform,border-color] duration-200 ease-out-expo hover:-translate-y-[3px] hover:border-line-strong motion-reduce:hover:translate-y-0"
    >
      <div aria-hidden="true">{preview}</div>
      <div className="px-[18px] py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{title}</h2>
          <span className="text-[12px] font-semibold whitespace-nowrap">Try it →</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted sm:text-[13px]">{line}</p>
      </div>
    </a>
  );
}

function TableOrderPreview() {
  return (
    <div className="relative h-[170px] overflow-hidden md:h-[200px]" style={{ background: "linear-gradient(150deg,#5f7d48,#24311d)" }}>
      <div className="absolute top-[26px] left-[26px] h-[200px] w-[110px] rounded-[22px] bg-fg p-[5px]">
        <div className="h-full rounded-[18px] bg-surface p-2.5 text-[9px] text-fg">
          <b className="font-semibold">Lotus Coffee</b>
          <div className="mt-2 h-2 rounded bg-paper" />
          <div className="mt-1.5 h-2 w-[70%] rounded bg-paper" />
        </div>
      </div>
      <div className="absolute top-[30px] right-[22px] w-[min(230px,calc(100%-170px))] rounded-[14px] bg-ink p-3 text-[10px] text-ink-fg">
        <b className="font-semibold">Kitchen</b>
        <div className="mt-2 rounded-[9px] border border-ink-accent p-2">
          Table 4 · 2× Iced latte
          <br />
          <span className="text-ink-accent">just now</span>
        </div>
      </div>
    </div>
  );
}

function ShopAssistantPreview() {
  const bubble = "max-w-[75%] px-[11px] py-2 sm:max-w-[60%]";
  return (
    <div
      className="flex h-[170px] flex-col gap-[7px] overflow-hidden p-[22px] text-[11px] md:h-[200px] md:justify-center"
      style={{ background: "linear-gradient(150deg,#e9e5da,#d9dfcd)" }}
    >
      <div lang="km" className={`${bubble} self-end rounded-[16px_16px_4px_16px] bg-fg text-white`}>
        {SA.home.ask}
      </div>
      <div lang="km" className={`${bubble} self-start rounded-[16px_16px_16px_4px] bg-white`}>
        {SA.home.answer}
      </div>
      <div className={`${bubble} self-start rounded-[16px_16px_16px_4px] bg-white`}>
        Total $19.50 · <b className="font-semibold text-khqr">Pay with KHQR</b>
      </div>
    </div>
  );
}
