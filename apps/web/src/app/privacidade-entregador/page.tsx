import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/legal-page';
import { PRIVACY_POLICY_ENTREGADOR } from '@/content/privacy-policy-entregador';

export const metadata: Metadata = {
  title: 'Política de Privacidade — THLGDP Entregador',
  description:
    'Política de privacidade do aplicativo THLGDP Entregador para entregadores de GLP.',
  robots: { index: true, follow: true },
};

export default function PrivacidadeEntregadorPage() {
  const policy = PRIVACY_POLICY_ENTREGADOR;

  return (
    <LegalPage title={policy.title} updatedAt={policy.updatedAt}>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          <span className="font-semibold text-slate-900">Aplicativo:</span>{' '}
          {policy.appName}
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">Desenvolvedor (Google Play):</span>{' '}
          {policy.playDeveloper}
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">Pacote Android:</span>{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{policy.androidPackage}</code>
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">Controlador dos dados / Operador:</span>{' '}
          {policy.controller}
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">CNPJ:</span> {policy.controllerCnpj}
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">Contato:</span>{' '}
          <a href={`mailto:${policy.contactEmail}`} className="text-brand hover:underline">
            {policy.contactEmail}
          </a>
        </p>
        <p className="mt-2">
          <span className="font-semibold text-slate-900">Site:</span>{' '}
          <a href={policy.website} className="text-brand hover:underline">
            {policy.website}
          </a>
        </p>
      </div>

      {policy.sections.map((section) => (
        <LegalSection
          key={section.heading}
          heading={section.heading}
          paragraphs={'paragraphs' in section ? section.paragraphs : undefined}
          list={'list' in section ? section.list : undefined}
          extra={'extra' in section ? section.extra : undefined}
        />
      ))}
    </LegalPage>
  );
}
