import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Khedut AI - Smart Farming Assistant",
  description: "Ask crop-specific farming questions and get grounded, cited answers from an agriculture knowledge base.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // Defaults to dark; the inline script below (run before hydration)
      // removes the class if the visitor previously chose light, so
      // there's no flash of the wrong theme.
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("khedut-ai:theme")==="light"){document.documentElement.classList.remove("dark")}}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
