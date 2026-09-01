import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/context/AuthContext";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { FirebaseNotifications } from "@/components/FirebaseNotifications";

import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Face Detector",
  title: "Face Detector",
  description: "AI-powered face recognition attendance management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Face Detector",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
