import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sample App',
  description: 'A sample Next.js application for testing',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
