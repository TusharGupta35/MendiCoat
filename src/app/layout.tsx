import type { Metadata } from 'next';
import { NavigationLoader } from '@/components/NavigationLoader';
import './globals.css';

export const metadata: Metadata = {
  // The app is no longer one game, so the title is no longer one game's name.
  title: 'Dehel Pakad — games with friends',
  description:
    'Play Mendi Coat with friends in real time, with more card and party games on the way. One level and one record across every game.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Once, at the root, so every link in the app raises the loading
            screen at the click rather than when the next route answers. */}
        <NavigationLoader />
      </body>
    </html>
  );
}
