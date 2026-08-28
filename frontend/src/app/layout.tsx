import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://imthis.site"),
  title: "I’m This — داستان شما، سایت شما",
  description: "ساخت و میزبانی سایت شخصی برای نمونه‌کار، بیوگرافی، رزومه و برند شخصی شما.",
  keywords: ["I’m This", "personal site", "portfolio", "biography", "resume site", "personal brand"],
  authors: [{ name: "I’m This" }],
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    shortcut: ["/logo.svg"],
    apple: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "I’m This — Your story, your site",
    description: "We build and host a personal site for your portfolio, biography, résumé, and personal brand.",
    url: "https://imthis.site",
    siteName: "I’m This",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "I’m This — Your story, your site",
    description: "We build and host your professional personal site.",
  },
};

export const viewport: Viewport = { themeColor: "#0F6E56" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
