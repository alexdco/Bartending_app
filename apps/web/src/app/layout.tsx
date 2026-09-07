import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";
import { Providers } from "./providers";

const fraunces = Fraunces({
  variable: "--font-display-loaded",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body-loaded",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bartending App",
  description: "Recipes and pantry ideas for home bartenders.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <Providers>
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
