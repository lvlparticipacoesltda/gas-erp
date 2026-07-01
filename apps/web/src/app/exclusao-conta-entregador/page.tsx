import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/legal-page';
import { ACCOUNT_DELETION_ENTREGADOR } from '@/content/privacy-policy-entregador';

export const metadata: Metadata = {
  title: 'Exclusão de conta — App Entregador | Gás do Povo',
  description:
    'Como solicitar a exclusão da conta e dos dados no aplicativo Gás do Povo Entregador.',
  robots: { index: true, follow: true },
};

export default function ExclusaoContaEntregadorPage() {
  const content = ACCOUNT_DELETION_ENTREGADOR;

  return (
    <LegalPage title={content.title} updatedAt={content.updatedAt}>
      <p className="text-sm leading-relaxed text-slate-700">
        O Google Play exige que aplicativos que coletam dados pessoais ofereçam um caminho
        claro para o usuário solicitar a exclusão da conta. Siga os passos abaixo se você é
        entregador e deseja remover seu acesso ao App Gás do Povo Entregador.
      </p>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Como solicitar</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-700">
          {content.steps.map((step) => (
            <li key={step.slice(0, 48)}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Observação importante</p>
        <p className="mt-2 leading-relaxed">{content.note}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Contato</h2>
        <p className="mt-3 text-sm text-slate-700">
          E-mail:{' '}
          <a href={`mailto:${content.contactEmail}`} className="font-medium text-brand hover:underline">
            {content.contactEmail}
          </a>
        </p>
      </section>

      <p className="text-sm text-slate-600">
        Consulte também a{' '}
        <Link href="/privacidade-entregador" className="font-medium text-brand hover:underline">
          Política de Privacidade do App Entregador
        </Link>
        .
      </p>
    </LegalPage>
  );
}
