import type { Metadata } from "next";
import { DemoBar } from "@/components/shared/DemoBar";
import { ShopAssistant } from "@/features/shop-assistant/ui/ShopAssistant";

export const metadata: Metadata = {
  title: "Shop Assistant: an AI that sells in Khmer and English",
  description: "Chat with Mealea Fashion's AI assistant in Khmer or English. It checks real stock, quotes delivery in Phnom Penh and takes the order with KHQR. A live demo by Raevori Studio.",
  alternates: { canonical: "/shop-assistant" },
};

export default function ShopAssistantPage() {
  return (
    <>
      <DemoBar />
      <ShopAssistant />
    </>
  );
}
