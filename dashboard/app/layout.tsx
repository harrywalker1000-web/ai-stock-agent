import type { Metadata } from "next";
import { Space_Grotesk, Syne, Fira_Code } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Haz Capital Management",
  description: "Autonomous AI hedge fund — 11 agents, one portfolio.",
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${syne.variable} ${firaCode.variable}`}
    >
      <body className="antialiased bg-[#030005] text-[#E8EDF2]">
        <Navbar />
        {children}
      </body>
    </html>
  );
}
