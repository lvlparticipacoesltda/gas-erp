'use client';

import { useEffect, useState } from 'react';
import { formatActiveRouteLabel } from '@gas-erp/shared';

const TICK_MS = 30_000;

export function RouteElapsed({
  startedAt,
  className = 'mt-1 text-xs font-semibold text-amber-700',
}: {
  startedAt: string | null | undefined;
  className?: string;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!startedAt) return null;

  const label = formatActiveRouteLabel(startedAt, now);
  if (!label) return null;

  return <p className={className}>⏱ {label}</p>;
}
