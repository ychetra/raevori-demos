import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Admin } from "@/features/table-order/ui/admin/Admin";

/** The owner's admin for a private demo room: never in search results. */
export const metadata: Metadata = {
  title: "Owner admin · Table Order",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Admin />
      </Suspense>
    </>
  );
}
