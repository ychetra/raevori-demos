import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { CustomerApp } from "@/features/table-order/ui/CustomerApp";

export const metadata: Metadata = {
  title: "Lotus Coffee menu",
  robots: { index: false, follow: false },
};

export default function MenuPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <CustomerApp />
      </Suspense>
    </>
  );
}
