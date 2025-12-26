import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "MVD – TI Tickets",
  description: "Tickets e Insights – Veta Dorada",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* HEADER CORPORATIVO */}
        <header className="mvd-header">
          <img
            src="/logo_mvd.png"
            alt="Veta Dorada"
            className="mvd-logo"
          />
          <div className="mvd-header-text">
            <h1>MVD – TI Tickets</h1>
            <span>Copiloto TI · Insights & Power BI</span>
          </div>
        </header>

        {/* CONTENIDO */}
        <main className="mvd-content">
          {children}
        </main>
      </body>
    </html>
  );
}
