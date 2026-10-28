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
          Five real products built by Raevori Studio in Phnom Penh. All work in Khmer and English.
        </p>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <DemoCard
            href="/table-order"
            className="lg:col-span-3"
            title="Table Order"
            line="QR menu, KHQR checkout and a live kitchen screen. For cafés and restaurants."
            preview={<TableOrderPreview />}
          />
          <DemoCard
            href="/shop-assistant"
            className="lg:col-span-3"
            title="Shop Assistant"
            line="AI that sells in Khmer and English, from real stock. For Facebook and Telegram shops."
            preview={<ShopAssistantPreview />}
          />
          <DemoCard
            href="/shop-pulse"
            className="lg:col-span-2"
            title="Shop Pulse"
            line="Live sales, best sellers and a 9 pm Telegram report. For any shop that takes KHQR."
            preview={<ShopPulsePreview />}
          />
          <DemoCard
            href="/queue"
            className="lg:col-span-2"
            title="Smart Queue"
            line="Take a number by QR and get called on your phone. For clinics, repair shops and banks."
            preview={<SmartQueuePreview />}
          />
          <DemoCard
            href="/booking"
            className="md:col-span-2 lg:col-span-2"
            title="Booking"
            line="Book a time, pay a small KHQR deposit, and the salon sees it live. For salons, spas and clinics."
            preview={<BookingPreview />}
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

function DemoCard({ href, title, line, preview, className = "" }: { href: string; title: string; line: string; preview: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      // Inline radius: the global :focus-visible rule would otherwise square the corners to 6px.
      style={{ borderRadius: 22 }}
      className={`group block overflow-hidden border border-line bg-surface transition-[transform,border-color] duration-200 ease-out-expo hover:-translate-y-[3px] hover:border-line-strong motion-reduce:hover:translate-y-0 ${className}`}
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

function SmartQueuePreview() {
  return (
    <div
      className="flex h-[170px] items-center justify-center gap-4 overflow-hidden p-[22px] md:h-[200px]"
      style={{ background: "linear-gradient(150deg,#d9dfcd,#a8b897)" }}
    >
      <div className="w-[min(230px,calc(100%-110px))] rounded-[14px] bg-ink p-3 text-ink-fg">
        <div className="text-[10px] text-ink-muted">Now serving</div>
        <div className="mt-0.5 text-[38px] leading-none font-semibold tracking-[-0.05em] tabular-nums">R-015</div>
        <div className="mt-1.5 text-[11px] font-semibold text-ink-accent">→ Counter 1</div>
        <div className="mt-2.5 flex gap-1.5 text-[10px] text-ink-muted tabular-nums">
          {["P-007", "R-016", "C-004"].map((n) => (
            <span key={n} className="rounded-[6px] border border-ink-line px-1.5 py-0.5">{n}</span>
          ))}
        </div>
      </div>
      <div className="w-[88px] shrink-0 rounded-[18px] bg-fg p-[4px]">
        <div className="flex h-[120px] flex-col items-center justify-center rounded-[14px] bg-accent px-1.5 text-center text-white">
          <div className="text-[9.5px] leading-tight font-semibold">Your turn</div>
          <div className="mt-1 text-[16px] leading-none font-semibold tabular-nums">R-015</div>
          <div className="mt-1 text-[9px] opacity-85">Counter 1</div>
        </div>
      </div>
    </div>
  );
}

function ShopPulsePreview() {
  const bars = [38, 64, 50, 82, 70, 96, 56];
  return (
    <div
      className="flex h-[170px] items-end justify-between gap-5 overflow-hidden p-[22px] md:h-[200px]"
      style={{ background: "linear-gradient(150deg,#f4f1e8,#e3e8d8)" }}
    >
      <div className="w-[150px] shrink-0 self-center rounded-[14px] border border-line bg-surface p-3">
        <div className="text-[10.5px] text-muted">Sales today</div>
        <div className="mt-0.5 text-[22px] leading-tight font-semibold tracking-[-0.03em] tabular-nums">$418.25</div>
        <div className="mt-1 text-[10px] text-muted">
          <b className="font-semibold text-fg">▲ 6%</b> vs yesterday
        </div>
      </div>
      <div className="flex h-[110px] max-w-[220px] flex-1 items-end gap-[5px] md:h-[130px]">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-t-[3px] bg-accent" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

function BookingPreview() {
  const cols: { name: string; blocks: { top: number; h: number; label?: string; held?: boolean; muted?: boolean }[] }[] = [
    { name: "Bopha", blocks: [{ top: 0, h: 2, label: "Dany", muted: true }, { top: 3, h: 3, label: "Sreypov" }] },
    { name: "Dara", blocks: [{ top: 1, h: 1, label: "Vanna" }, { top: 3, h: 1, held: true }, { top: 5, h: 2, label: "Rithy" }] },
    { name: "Srey Leak", blocks: [{ top: 0, h: 2, label: "Malis" }, { top: 4, h: 2, label: "Kanha" }] },
  ];
  const row = 13;
  return (
    <div
      className="flex h-[170px] items-center justify-center gap-4 overflow-hidden p-[22px] md:h-[200px]"
      style={{ background: "linear-gradient(150deg,#e9e5da,#c9d4b8)" }}
    >
      <div className="w-[min(250px,calc(100%-110px))] rounded-[14px] bg-ink p-3 text-ink-fg">
        <div className="text-[10px] text-ink-muted">Bopha Beauty · Today</div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {cols.map((c) => (
            <div key={c.name} className="min-w-0">
              <div className="truncate text-[9.5px] font-semibold">{c.name}</div>
              <div className="relative mt-1 border-t border-ink-line" style={{ height: row * 7 }}>
                {c.blocks.map((b) => (
                  <div
                    key={b.top}
                    className={`absolute right-0 left-0 truncate rounded-[4px] px-1 text-[8.5px] leading-[13px] ${
                      b.held ? "border border-ink-line text-ink-fg" : b.muted ? "bg-ink-surface text-ink-muted" : "bg-ink-accent text-ink"
                    }`}
                    style={{
                      top: b.top * row + 1,
                      height: b.h * row - 2,
                      ...(b.held && { backgroundImage: "repeating-linear-gradient(135deg, rgba(168,196,143,0.3) 0 4px, transparent 4px 8px)" }),
                    }}
                  >
                    {b.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="w-[88px] shrink-0 rounded-[18px] bg-fg p-[4px]">
        <div className="flex h-[120px] flex-col items-center justify-center rounded-[14px] bg-surface px-1.5 text-center">
          <div className="text-[9.5px] leading-tight font-semibold">Pay deposit</div>
          <div className="mt-1 text-[16px] leading-none font-semibold tabular-nums">$3</div>
          <div className="mt-2 rounded-[6px] bg-khqr px-2 py-1 text-[9px] font-semibold text-white">KHQR</div>
        </div>
      </div>
    </div>
  );
}
