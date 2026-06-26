import type { DelivererPendingDelivery } from '@gas-erp/shared';
import { formatWaitTime, getElapsedWaitingSeconds } from '@gas-erp/shared';

export function PendingDeliveriesInfo({
  pendingDeliveries,
  compact = false,
}: {
  pendingDeliveries: DelivererPendingDelivery[];
  compact?: boolean;
}) {
  if (pendingDeliveries.length === 0) return null;

  const count = pendingDeliveries.length;

  return (
    <div
      className={`rounded-lg border border-orange-200 bg-orange-50 ${
        compact ? 'px-2 py-1.5' : 'px-2.5 py-2'
      }`}
    >
      <p className={`font-semibold text-orange-900 ${compact ? 'text-[11px]' : 'text-xs'}`}>
        {count} {count === 1 ? 'rota aguardando aceite' : 'rotas aguardando aceite'}
      </p>
      <ul className={`space-y-1 ${compact ? 'mt-1' : 'mt-1.5'}`}>
        {pendingDeliveries.map((delivery) => (
          <li key={delivery.id} className={`text-orange-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            <span className="font-medium">{delivery.customerName ?? 'Cliente'}</span>
            {' · há '}
            {formatWaitTime(getElapsedWaitingSeconds(delivery.assignedAt))}
            {!compact && delivery.deliveryAddress && (
              <p className="mt-0.5 line-clamp-2 font-normal text-orange-700/90">
                {delivery.deliveryAddress}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
