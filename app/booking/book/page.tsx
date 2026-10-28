import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { BookApp } from "@/features/booking/ui/BookApp";

/** A booking page always belongs to one throwaway demo room: never index it. */
export const metadata: Metadata = {
  title: "Bopha Beauty: book a time",
  robots: { index: false, follow: false },
};

export default function BookPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <BookApp />
      </Suspense>
    </>
  );
}
