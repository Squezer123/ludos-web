import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LUDOS — dziennik gildii",
  description: "Analiza danych zebranych przez addon LUDOS-on",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
