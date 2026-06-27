'use client';

import { useEffect, useState } from 'react';
import { formatActiveRouteLabel } from '@gas-erp/shared';

const TICK_MS = 30_000;

export function RouteElapsed({
  startedAt,
  className = 'mt-1 text-xs font-semibold text-amber-700',
  inline = false,
}: {
  startedAt: string | null | undefined;
  className?: string;
  inline?: boolean;
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

  const text = `⏱ ${label}`;
  if (inline) {
    return <span className={className}>{text}</span>;
  }
  return <p className={className}>{text}</p>;
}
