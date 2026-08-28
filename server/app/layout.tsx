import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Marks Portal',
  description: 'Director of Studies marks entry and release',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
