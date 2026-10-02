import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter_Tight, Pacifico } from "next/font/google";
import "./globals.css";
import RouteTracker from "@/components/RouteTracker";

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  weight: ["600", "700", "900"],
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const pacifico = Pacifico({
  variable: "--font-pacifico",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Linkee",
  description: "Entraide étudiante — logistique anti-gaspi à Lyon.",
  applicationName: "Linkee",
  icons: { icon: "/pwa-icon?size=192", apple: "/pwa-icon?size=180" },
  appleWebApp: { capable: true, title: "Linkee", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0A1A3F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${barlowCondensed.variable} ${interTight.variable} ${pacifico.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--cream)] text-[var(--navy)] font-sans">
        <RouteTracker />
        {children}
      </body>
    </html>
  );
}
