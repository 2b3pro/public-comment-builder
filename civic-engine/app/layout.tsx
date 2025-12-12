import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: {
    template: '%s | Public Comment Builder',
    default: 'Public Comment Builder - Draft Substantive Federal Comments',
  },
  description: "Draft substantive public comments on federal regulations without being a lawyer. Our AI tools help you analyze dockets, select arguments, and generate legally effective submissions in minutes.",
  keywords: ["public comment", "federal regulations", "regulations.gov", "AI legal tools", "civic engagement", "rulemaking", "administrative procedure act"],
  authors: [{ name: "2B3 Productions" }],
  creator: "2B3 Productions",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "Public Comment Builder",
    description: "Draft substantive public comments on federal regulations without being a lawyer.",
    siteName: "Public Comment Builder",
  },
  twitter: {
    card: "summary_large_image",
    title: "Public Comment Builder",
    description: "Draft substantive public comments on federal regulations without being a lawyer.",
    creator: "@2b3pro",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-['Public_Sans'] antialiased bg-[#f6f7f8] text-gray-900 min-h-screen flex flex-col">
        <SiteHeader />
        <main className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
