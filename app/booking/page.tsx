import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Calendar } from "@/features/booking/ui/Calendar";

const TITLE = "Booking: bookings with a deposit, no more no-shows";
const DESCRIPTION = "Book a time, pay a small KHQR deposit, and the salon sees it live. For salons, spas and clinics. A live demo by Raevori Studio.";

const META: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/booking" },
  // Replaces the layout's openGraph object, so it repeats the site-wide fields.
  openGraph: { type: "website", siteName: "Raevori demos", locale: "en_US", title: TITLE, description: DESCRIPTION, url: "/booking" },
};

/** A calendar with a demo room (`?room=`) is a throwaway URL: keep it out of search results. */
export async function generateMetadata({ searchParams }: PageProps<"/booking">): Promise<Metadata> {
  const { room } = await searchParams;
  return room ? { ...META, robots: { index: false, follow: false } } : META;
}

export default function BookingPage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Calendar />
      </Suspense>
    </>
  );
}
