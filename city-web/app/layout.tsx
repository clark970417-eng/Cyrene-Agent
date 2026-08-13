import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${proto}://${host}`);
  return {
    metadataBase,
    title: { default: "永晝花庭", template: "%s｜永晝花庭" },
    description: "你離開時，時間仍在這裡流動。花會長大，燈會亮起，每一段日子都會被記住。",
    openGraph: { title: "永晝花庭", description: "你離開時，時間仍在這裡流動。", images: [{ url: "/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: "永晝花庭", description: "你離開時，時間仍在這裡流動。", images: ["/og.png"] },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
