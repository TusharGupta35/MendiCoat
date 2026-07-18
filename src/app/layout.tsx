import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mendi Coat Multiplayer',
  description: 'Real-time multiplayer Mendi Coat card game',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
