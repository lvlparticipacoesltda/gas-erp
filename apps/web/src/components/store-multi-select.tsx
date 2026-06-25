'use client';

import { Label } from '@/components/ui';
import { cn } from '@/lib/utils';

interface StoreOption {
  id: string;
  name: string;
  code?: string;
}

export function StoreMultiSelect({
  stores,
  selected,
  onChange,
  required,
}: {
  stores: StoreOption[];
  selected: string[];
  onChange: (storeIds: string[]) => void;
  required?: boolean;
}) {
  function toggle(storeId: string) {
    if (selected.includes(storeId)) {
      onChange(selected.filter((id) => id !== storeId));
    } else {
      onChange([...selected, storeId]);
    }
  }

  function selectAll() {
    onChange(stores.map((s) => s.id));
  }

  function clearAll() {
    onChange([]);
  }

  if (stores.length === 0) {
    return <p className="text-sm text-slate-500">Nenhuma loja cadastrada.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label>
          Lojas vinculadas
          {required && <span className="text-red-500"> *</span>}
        </Label>
        <div className="flex gap-2 text-xs">
          <button type="button" onClick={selectAll} className="text-brand hover:underline">
            Todas
          </button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={clearAll} className="text-slate-500 hover:underline">
            Limpar
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-slate-500">
        Marque uma ou mais lojas às quais este usuário terá acesso.
        {selected.length > 0 && (
          <span className="font-medium text-brand-dark"> {selected.length} selecionada(s)</span>
        )}
      </p>

      <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
        {stores.map((store) => {
          const checked = selected.includes(store.id);
          return (
            <label
              key={store.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition',
                checked ? 'border-brand-light bg-brand-muted' : 'border-transparent hover:bg-slate-50',
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(store.id)}
                className="h-4 w-4 rounded border-slate-300 text-brand"
              />
              <span className="flex-1 font-medium text-slate-800">{store.name}</span>
              {store.code && <span className="text-xs text-slate-400">{store.code}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
