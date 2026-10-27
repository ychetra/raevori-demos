import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Kitchen } from "@/features/table-order/ui/Kitchen";

export const metadata: Metadata = {
  title: "Table Order: QR menu with a live kitchen screen",
  description: "Scan a QR code, order in Khmer or English, pay with KHQR and watch the ticket land on the kitchen screen. A live demo by Raevori Studio.",
  alternates: { canonical: "/table-order" },
};

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
