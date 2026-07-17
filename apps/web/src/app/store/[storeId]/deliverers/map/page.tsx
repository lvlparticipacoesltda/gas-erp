'use client';

import { DeliverersMapView } from '@/components/deliverers-map-view';
import { buildStoreHref } from '@/lib/store-nav';
import { useParams } from 'next/navigation';

export default function DelivererMapPage() {
  const { storeId } = useParams<{ storeId: string }>();

  return (
    <DeliverersMapView
      storeId={storeId}
      listHref={buildStoreHref(storeId, 'deliverers')}
    />
  );
}
