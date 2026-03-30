import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Echo — Turn your knowledge into a living character",
  description: "Live AI characters powered by your writing, voice, and video presence.",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className="scroll-smooth"><body className="min-h-screen"><Providers>{children}</Providers></body></html>;
}
