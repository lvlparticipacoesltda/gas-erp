import Link from 'next/link';
import { Logo } from '@/components/logo';

interface LegalPageProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export function LegalPage({ title, updatedAt, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sand to-sand">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Logo size="sm" />
          <Link href="/login" className="text-sm font-medium text-brand hover:underline">
            Acesso ao sistema
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: {updatedAt}</p>
        <div className="mt-8 space-y-8 text-slate-700">{children}</div>
      </main>
      <footer className="border-t border-slate-200/80 py-6 text-center text-xs text-slate-500">
        <p>THL Gás do Povo — Rede Gás Litoral</p>
        <p className="mt-1">CNPJ 62.512.525/0001-63</p>
      </footer>
    </div>
  );
}

export function LegalSection({
  heading,
  paragraphs,
  list,
  extra,
}: {
  heading: string;
  paragraphs?: readonly string[];
  list?: readonly { label: string; detail: string }[];
  extra?: string;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
      {paragraphs?.map((p) => (
        <p key={p.slice(0, 40)} className="mt-3 text-sm leading-relaxed">
          {p}
        </p>
      ))}
      {list ? (
        <ul className="mt-4 space-y-3">
          {list.map((item) => (
            <li key={item.label} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <span className="font-semibold text-slate-900">{item.label}</span>
              <span className="text-slate-600"> — {item.detail}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {extra ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{extra}</p>
      ) : null}
    </section>
  );
}
