import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/context/AuthContext";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { FirebaseNotifications } from "@/components/FirebaseNotifications";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://face-detector-seven.vercel.app",
  ),
  applicationName: "Face Attendance",
  title: {
    default: "Face Attendance — AI-Powered School Attendance",
    template: "%s | Face Attendance",
  },
  description:
    "Streamline school attendance with AI face recognition. Instant check-in, real-time alerts, and weekly reports — all in one dashboard.",
  keywords: [
    "face recognition",
    "attendance management",
    "school attendance",
    "AI attendance",
    "biometric attendance",
    "student tracking",
    "staff attendance",
  ],
  manifest: "/manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Face Attendance",
  },
  openGraph: {
    type: "website",
    siteName: "Face Attendance",
    title: "Face Attendance — AI-Powered School Attendance",
    description:
      "Streamline school attendance with AI face recognition. Instant check-in, real-time alerts, and weekly reports.",
    images: [{ url: "/images/face-attendance-logo.png", width: 512, height: 512, alt: "Face Attendance logo" }],
  },
  twitter: {
    card: "summary",
    title: "Face Attendance — AI-Powered School Attendance",
    description:
      "Streamline school attendance with AI face recognition. Instant check-in, real-time alerts, and weekly reports.",
    images: ["/images/face-attendance-logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#030712" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/images/face-attendance-logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.pwaDeferredPrompt = null;
              window.addEventListener('beforeinstallprompt', function(e) {
                e.preventDefault();
                window.pwaDeferredPrompt = e;
              });
            `,
          }}
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegistration />
        <PwaInstallPrompt />
        <FirebaseNotifications />
      </body>
    </html>
  );
}
