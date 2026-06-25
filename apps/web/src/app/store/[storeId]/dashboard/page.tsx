import { redirect } from 'next/navigation';

/** Dashboard removido — redireciona para Resumo diário. */
export default async function StoreDashboardRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/store/${storeId}/daily-summary`);
}
