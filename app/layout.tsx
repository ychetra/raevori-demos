import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_Khmer } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const khmer = Noto_Sans_Khmer({ subsets: ["khmer"], variable: "--font-khmer", weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://demo.raevori.com"),
  title: { default: "Live demos · Raevori Studio", template: "%s · Raevori demos" },
  description: "Try real products built by Raevori Studio: a QR ordering system with a live kitchen screen, and an AI shop assistant that sells in Khmer and English.",
  openGraph: { type: "website", siteName: "Raevori demos", locale: "en_US" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f4f1e8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${khmer.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
