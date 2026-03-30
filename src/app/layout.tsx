import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "EchoNest — Turn your knowledge into a living character",
  description: "Living AI characters powered by your writing, voice, and live video presence.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="scroll-smooth"><body className="min-h-screen"><Providers>{children}</Providers></body></html>;
}
