import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gas ERP',
  description: 'Sistema de gestão para distribuidoras de gás',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
