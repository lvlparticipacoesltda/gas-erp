'use client';

import { DeliverersMapView } from '@/components/deliverers-map-view';

export default function MasterDeliverersMapPage() {
  return (
    <DeliverersMapView
      listHref="/master/deliverers"
      showStoreLabels
      showStoreFilter
    />
  );
}
