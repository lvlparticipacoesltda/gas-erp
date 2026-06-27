import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gás do Povo',
  description: 'Gestão para distribuidoras de gás',
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
