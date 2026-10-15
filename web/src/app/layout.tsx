import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/common/AppHeader";
import { AppFooter } from "@/components/common/AppFooter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Secure: passwordless sign-in",
  description: "Passkeys + face and gesture liveness. No passwords, no OTPs.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#131419" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>
          <AppHeader />
          {children}
          <AppFooter />
          <Toaster theme="dark" richColors position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  );
}
