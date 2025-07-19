import type { Metadata } from "next";
import "./globals.css";
import { Providers } from './providers';
import StartupInit from '../src/components/StartupInit';

export const metadata: Metadata = {
  title: "Online",
  description: "See who's online and active right now",
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="font-sans antialiased"
      >
        <Providers>
          <StartupInit />
          {children}
        </Providers>
      </body>
    </html>
  );
}
