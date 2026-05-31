import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Planet to Particle",
  description:
    "A source-grounded knowledge map of who controls resources, who benefits, who bears the costs, and what communities are doing about it. No mocked data.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
