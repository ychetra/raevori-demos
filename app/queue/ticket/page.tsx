import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { TicketApp } from "@/features/queue/ui/TicketApp";

/** A ticket page always belongs to one throwaway demo queue: never index it. */
export const metadata: Metadata = {
  title: "Sokha Phone Repair: take a number",
  robots: { index: false, follow: false },
};

export default function TicketPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <TicketApp />
      </Suspense>
    </>
  );
}
