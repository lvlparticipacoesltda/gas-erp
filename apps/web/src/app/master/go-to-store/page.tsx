import { redirect } from 'next/navigation';

/** Ir para loja removido — use Visão geral no painel master. */
export default function GoToStoreRedirect() {
  redirect('/master/dashboard');
}
