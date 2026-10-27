import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { ShopPulse } from "@/features/shop-pulse/ui/ShopPulse";

const META: Metadata = {
  title: "Shop Pulse: live sales for your shop",
  description: "Today's sales, best sellers and busy hours, live from every KHQR payment, plus a 9 pm Telegram report. A live demo by Raevori Studio.",
  alternates: { canonical: "/shop-pulse" },
};

/** A dashboard with a demo room (`?room=`) is a throwaway URL: keep it out of search results. */
export async function generateMetadata({ searchParams }: PageProps<"/shop-pulse">): Promise<Metadata> {
  const { room } = await searchParams;
  return room ? { ...META, robots: { index: false, follow: false } } : META;
}

export default function ShopPulsePage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <ShopPulse />
      </Suspense>
    </>
  );
}
