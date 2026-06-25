import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TAMS Hub Prototype",
  description: "AI-assisted campus workflow prototype for FEU Alabang student organizations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
