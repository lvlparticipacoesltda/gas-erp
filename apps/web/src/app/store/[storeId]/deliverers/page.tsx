'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { PageHeader } from '@/components/ui';
import { DeliverersPanel } from '@/components/deliverers/deliverers-panel';
import { api, getStoredUser, getToken } from '@/lib/api';
import { buildStoreHref } from '@/lib/store-nav';
import { hasScreenPermission, type AuthUser } from '@gas-erp/shared';

export default function DeliverersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [deliveriesCount, setDeliveriesCount] = useState(0);
  const [canViewMap, setCanViewMap] = useState(false);

  const loadMeta = useCallback(() => {
    return api<unknown[]>(`/deliveries?storeId=${storeId}`, {}, getToken()).then((del) => {
      setDeliveriesCount(del.length);
    });
  }, [storeId]);

  useEffect(() => {
    const user = getStoredUser<AuthUser>();
    setCanViewMap(
      user ? hasScreenPermission(user.role, user.permissions, 'store.deliverers.map') : false,
    );
    loadMeta();
  }, [loadMeta]);

  return (
    <>
      <PageHeader
        title="Entregadores"
        subtitle={`${deliveriesCount} entregas ativas hoje`}
        action={
          canViewMap ? (
            <Link
              href={buildStoreHref(storeId, 'deliverers/map')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <MapPin className="h-4 w-4" />
              Ver mapa
            </Link>
          ) : undefined
        }
      />
      <DeliverersPanel storeId={storeId} />
    </>
  );
}
