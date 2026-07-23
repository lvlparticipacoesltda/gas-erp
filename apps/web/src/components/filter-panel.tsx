'use client';

import type { ReactNode } from 'react';
import { Button, Card } from '@/components/ui';

/** Painel de filtros no padrão gestão (campos + Redefinir / Buscar). */
export function FilterPanel({
  children,
  onSearch,
  onReset,
  searching = false,
}: {
  children: ReactNode;
  onSearch: () => void;
  onReset: () => void;
  searching?: boolean;
}) {
  return (
    <Card className="mb-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onReset} disabled={searching}>
            Redefinir
          </Button>
          <Button type="submit" disabled={searching}>
            {searching ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
