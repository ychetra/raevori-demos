import type { Metadata } from "next";
import { Suspense } from "react";
import { DemoBar } from "@/components/shared/DemoBar";
import { Board } from "@/features/queue/ui/Board";

const META: Metadata = {
  title: "Smart Queue: take a number from your phone",
  description: "Scan a QR, pick a service and get a number, then wait anywhere. Your phone tells you when it's your turn. A live demo by Raevori Studio.",
  alternates: { canonical: "/queue" },
};

/** A board with a demo queue (`?room=`) is a throwaway URL: keep it out of search results. */
export async function generateMetadata({ searchParams }: PageProps<"/queue">): Promise<Metadata> {
  const { room } = await searchParams;
  return room ? { ...META, robots: { index: false, follow: false } } : META;
}

export default function QueuePage() {
  return (
    <>
      <DemoBar />
      <Suspense>
        <Board />
      </Suspense>
    </>
  );
}
