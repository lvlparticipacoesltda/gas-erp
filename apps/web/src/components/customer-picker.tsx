'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  customerInitials,
  formatAddressShort,
  formatPhoneDisplay,
  type CustomerAddress,
} from '@/lib/customer-display';

export interface SaleCustomer {
  id: string;
  name: string;
  phone?: string;
  addresses: CustomerAddress[];
}

export type CustomerPickerValue =
  | { kind: 'none' }
  | { kind: 'anonymous' }
  | { kind: 'customer'; customer: SaleCustomer };

const MIN_SEARCH = 2;
const DEBOUNCE_MS = 300;

function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-brand-muted px-0.5 text-brand-dark">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-slate-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-32 rounded bg-slate-200" />
            <div className="h-3 w-24 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-muted text-xs font-bold text-brand-dark',
        className,
      )}
      aria-hidden
    >
      {customerInitials(name)}
    </span>
  );
}

export function CustomerPicker({
  storeId,
  value,
  onChange,
}: {
  storeId: string;
  value: CustomerPickerValue;
  onChange: (value: CustomerPickerValue) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<SaleCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (debouncedSearch.length < MIN_SEARCH) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    api<{ data: SaleCustomer[] }>(
      `/customers?search=${encodeURIComponent(debouncedSearch)}&pageSize=15`,
      {},
      getToken(),
    )
      .then((res) => {
        if (!cancelled) {
          setResults(res.data);
          setActiveIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectCustomer = useCallback(
    (customer: SaleCustomer) => {
      onChange({ kind: 'customer', customer });
      setSearch('');
      setDebouncedSearch('');
      setResults([]);
      setOpen(false);
    },
    [onChange],
  );

  const selectAnonymous = useCallback(() => {
    onChange({ kind: 'anonymous' });
    setSearch('');
    setOpen(false);
  }, [onChange]);

  const clearSelection = useCallback(() => {
    onChange({ kind: 'none' });
    setSearch('');
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

  const optionCount = results.length + 1;

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, optionCount - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (activeIndex < results.length) {
        selectCustomer(results[activeIndex]);
      } else {
        selectAnonymous();
      }
    }
  }

  if (value.kind === 'customer') {
    const { customer } = value;
    const phone = formatPhoneDisplay(customer.phone);
    return (
      <div className="rounded-xl border border-brand/30 bg-brand-muted/40 p-4">
        <div className="flex items-start gap-3">
          <CustomerAvatar name={customer.name} className="h-11 w-11 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{customer.name}</p>
            {phone ? <p className="mt-0.5 text-sm text-slate-600">{phone}</p> : null}
            <p className="mt-1 text-sm text-slate-500">{formatAddressShort(customer.addresses[0])}</p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 text-sm font-medium text-brand hover:underline"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  if (value.kind === 'anonymous') {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-slate-700">Cliente não identificado</p>
            <p className="mt-0.5 text-sm text-slate-500">Venda sem cadastro vinculado</p>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="shrink-0 text-sm font-medium text-brand hover:underline"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  const showDropdown = open && search.length > 0;
  const showHint = open && search.length > 0 && search.trim().length < MIN_SEARCH;
  const showEmpty =
    open && debouncedSearch.length >= MIN_SEARCH && !loading && results.length === 0;
  const showResults = open && debouncedSearch.length >= MIN_SEARCH && !loading && results.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={listId} className="mb-1 block text-sm font-medium text-slate-700">
        Buscar cliente
      </label>
      <Input
        ref={inputRef}
        id={listId}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={`${listId}-listbox`}
        aria-autocomplete="list"
        autoComplete="off"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder="Digite nome ou telefone (mín. 2 caracteres)"
      />
      <p className="mt-1.5 text-xs text-slate-500">
        Use ↑↓ e Enter para selecionar · Esc para fechar a lista
      </p>

      {showDropdown && (
        <div
          id={`${listId}-listbox`}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {loading && <ListSkeleton />}

          {showHint && (
            <p className="px-4 py-3 text-sm text-slate-500">Continue digitando para buscar…</p>
          )}

          {showEmpty && (
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-slate-600">Nenhum cliente encontrado para &ldquo;{debouncedSearch}&rdquo;</p>
              <Link
                href={`/store/${storeId}/customers`}
                className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
              >
                Cadastrar novo cliente
              </Link>
            </div>
          )}

          {showResults && (
            <ul className="max-h-64 overflow-y-auto p-1">
              {results.map((c, index) => {
                const phone = formatPhoneDisplay(c.phone);
                const neighborhood = c.addresses[0]?.neighborhood;
                const active = index === activeIndex;
                return (
                  <li key={c.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectCustomer(c)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition',
                        active ? 'bg-brand-muted' : 'hover:bg-slate-50',
                      )}
                    >
                      <CustomerAvatar name={c.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">
                          {highlightMatch(c.name, debouncedSearch)}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {phone ? highlightMatch(phone, debouncedSearch) : 'Sem telefone'}
                          {neighborhood ? (
                            <>
                              <span className="mx-1 text-slate-300">·</span>
                              {neighborhood}
                            </>
                          ) : null}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
              <li role="option" aria-selected={activeIndex === results.length}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(results.length)}
                  onClick={selectAnonymous}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border-t border-slate-100 px-3 py-2.5 text-left text-sm transition',
                    activeIndex === results.length ? 'bg-slate-100' : 'hover:bg-slate-50',
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    ?
                  </span>
                  <span className="text-slate-600">Venda sem cadastro</span>
                </button>
              </li>
            </ul>
          )}

          {!loading && !showHint && !showEmpty && !showResults && search.length >= MIN_SEARCH && (
            <p className="px-4 py-3 text-sm text-slate-500">Buscando…</p>
          )}
        </div>
      )}

      {!open && search.length === 0 && (
        <button
          type="button"
          onClick={selectAnonymous}
          className="mt-3 text-sm text-slate-500 underline-offset-2 hover:text-brand hover:underline"
        >
          Venda sem cadastro
        </button>
      )}
    </div>
  );
}
