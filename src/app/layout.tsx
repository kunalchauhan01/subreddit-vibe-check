import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Subreddit Vibe Check",
  description:
    "Sentiment analysis of the 50 hottest posts in any public subreddit, scored in the browser with VADER.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
