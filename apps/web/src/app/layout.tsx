import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gás do Povo',
  description: 'Gestão para distribuidoras de gás',
  icons: {
    icon: [{ url: '/brand/app-icon.png', type: 'image/png' }],
    apple: [{ url: '/brand/app-icon.png', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
