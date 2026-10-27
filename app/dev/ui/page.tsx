"use client";

import { useState } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { KhqrCard } from "@/components/shared/KhqrCard";
import { LangToggle } from "@/components/shared/LangToggle";
import { PhoneFrame } from "@/components/shared/PhoneFrame";
import { Qr } from "@/components/shared/Qr";
import type { Lang } from "@/lib/i18n";

/** Component gallery for reviewing shared UI. Not linked from anywhere and not indexed. */
export default function UiGallery() {
  const [lang, setLang] = useState<Lang>("en");
  const [paid, setPaid] = useState(0);
  return (
    <>
      <DemoBar />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 p-5">
        <div className="flex items-center gap-4"><LangToggle lang={lang} onChange={setLang} /><span className="text-sm text-muted">paid clicks: {paid}</span></div>
        <div className="rounded-2xl bg-gradient-to-br from-accent to-[#24311d] p-4"><LangToggle lang={lang} onChange={setLang} tone="glass" /></div>
        <div className="flex flex-wrap items-start gap-8">
          <PhoneFrame className="h-[600px] w-full md:w-[320px]">
            <div className="h-full bg-[#efe9e9] px-4 py-6"><KhqrCard amount={7.5} merchant="Lotus Coffee" lang={lang} onPaid={() => setPaid((n) => n + 1)} /></div>
          </PhoneFrame>
          <Qr value="https://demo.raevori.com/table-order/menu?room=abc&table=4" label="Menu QR" className="w-44" />
        </div>
      </main>
    </>
  );
}
