import type { Metadata } from 'next';
import './globals.css';
import { Disclaimer } from '../src/components/Disclaimer.js';

export const metadata: Metadata = {
  title: 'Cross-venue Risk Console',
  description: 'Read-only risk and analytics across prediction-market venues.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink">
        <Disclaimer />
        {children}
      </body>
    </html>
  );
}
