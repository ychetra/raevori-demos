import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Admin } from "@/features/queue/ui/admin/Admin";

/** The owner's admin for a private demo queue: never in search results. */
export const metadata: Metadata = {
  title: "Owner admin · Smart Queue",
  robots: { index: false, follow: false },
};

export default function QueueAdminPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Admin />
      </Suspense>
    </>
  );
}
