import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GameProvider } from "./game-provider";
import AppShell from "./app-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Escape the Epstein | The November Game",
  description: "A friendly November escape-room challenge. Check in each day, keep your streak alive, and make it to the boat with your crew.",
  applicationName: "Escape the Epstein",
  keywords: ["November challenge", "daily check-in", "streak game", "escape room"],
  icons: { icon: "/icons/escape-app.svg", apple: "/icons/escape-app-192.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Escape", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#097c87" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><GameProvider initialNow={new Date().toISOString()}><AppShell>{children}</AppShell></GameProvider></body></html>;
}
