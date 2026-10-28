import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Admin } from "@/features/booking/ui/admin/Admin";

/** The salon owner's admin for a private demo room: never in search results. */
export const metadata: Metadata = {
  title: "Owner admin · Booking",
  robots: { index: false, follow: false },
};

export default function BookingAdminPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Admin />
      </Suspense>
    </>
  );
}
