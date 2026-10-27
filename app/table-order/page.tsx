import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Kitchen } from "@/features/table-order/ui/Kitchen";

const META: Metadata = {
  title: "Table Order: QR menu with a live kitchen screen",
  description: "Scan a QR code, order in Khmer or English, pay with KHQR and watch the ticket land on the kitchen screen. A live demo by Raevori Studio.",
  alternates: { canonical: "/table-order" },
};

/** A kitchen with a demo room (`?room=`) is a throwaway URL: keep it out of search results. */
export async function generateMetadata({ searchParams }: PageProps<"/table-order">): Promise<Metadata> {
  const { room } = await searchParams;
  return room ? { ...META, robots: { index: false, follow: false } } : META;
}

export default function TableOrderPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Kitchen />
      </Suspense>
    </>
  );
}
