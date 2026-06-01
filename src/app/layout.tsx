import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScreenHelp — on-screen AI co-pilot",
  description: "Share. Capture. Ask. Multi-provider AI on top of whatever you're doing.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="text-text font-sans min-h-screen relative">
        <div className="ambient" />
        <div className="grain" />
        {children}
      </body>
    </html>
  );
}
