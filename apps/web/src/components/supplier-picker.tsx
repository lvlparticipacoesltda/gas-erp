'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Input, Label, Select } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SUPPLIER_TYPES, SUPPLIER_TYPE_LABELS, type PaginatedResponse } from '@gas-erp/shared';

export interface PurchaseSupplier {
  id: string;
  legalName: string;
  tradeName?: string | null;
  document?: string | null;
}

const MIN_SEARCH = 2;
const DEBOUNCE_MS = 300;

function supplierLabel(s: PurchaseSupplier): string {
  return s.tradeName || s.legalName;
}

function QuickSupplierRegister({
  defaultName,
  onCreated,
  onCancel,
}: {
  defaultName?: string;
  onCreated: (supplier: PurchaseSupplier) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState('PJ');
  const [legalName, setLegalName] = useState(defaultName ?? '');
  const [tradeName, setTradeName] = useState('');
  const [document, setDocument] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLegalName(defaultName ?? '');
  }, [defaultName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const created = await api<PurchaseSupplier>(
        '/suppliers',
        {
          method: 'POST',
          body: JSON.stringify({
            type,
            legalName: legalName.trim(),
            tradeName: tradeName.trim() || undefined,
            document: document.trim() || undefined,
            phone: phone.trim() || undefined,
          }),
        },
        getToken(),
      );
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar fornecedor');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm font-semibold text-slate-900">Cadastro rápido de fornecedor</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Tipo</Label>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {SUPPLIER_TYPES.map((t) => (
              <option key={t} value={t}>
                {SUPPLIER_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{type === 'PF' ? 'CPF' : 'CNPJ'}</Label>
          <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      <div>
        <Label>Nome empresarial (Razão Social)</Label>
        <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Nome fantasia</Label>
          <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Opcional" />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Opcional" />
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : 'Cadastrar e selecionar'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function SupplierPicker({
  value,
  onChange,
}: {
  value: PurchaseSupplier | null;
  onChange: (supplier: PurchaseSupplier | null) => void;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<PurchaseSupplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [registerOpen, setRegisterOpen] = useState(false);

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
    api<PaginatedResponse<PurchaseSupplier>>(
      `/suppliers?search=${encodeURIComponent(debouncedSearch)}&pageSize=15`,
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

  const selectSupplier = useCallback(
    (supplier: PurchaseSupplier) => {
      onChange(supplier);
      setSearch('');
      setDebouncedSearch('');
      setResults([]);
      setOpen(false);
      setRegisterOpen(false);
    },
    [onChange],
  );

  const clearSelection = useCallback(() => {
    onChange(null);
    setSearch('');
    setResults([]);
    setRegisterOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

  const openRegister = useCallback((prefill?: string) => {
    setOpen(false);
    setRegisterOpen(true);
    if (prefill) setSearch(prefill);
  }, []);

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
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open && results[activeIndex]) {
      e.preventDefault();
      selectSupplier(results[activeIndex]);
    }
  }

  if (value) {
    return (
      <div className="rounded-xl border border-brand/30 bg-brand-muted/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900">{supplierLabel(value)}</p>
            {value.tradeName && value.legalName !== value.tradeName ? (
              <p className="mt-0.5 text-sm text-slate-600">{value.legalName}</p>
            ) : null}
            {value.document ? <p className="mt-0.5 text-sm text-slate-500">{value.document}</p> : null}
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
  const showEmpty = open && debouncedSearch.length >= MIN_SEARCH && !loading && results.length === 0;
  const showResults = open && debouncedSearch.length >= MIN_SEARCH && !loading && results.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={listId} className="mb-1 block text-sm font-medium text-slate-700">
            Fornecedor
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
            placeholder="Buscar fornecedor (mín. 2 caracteres)"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-label="Cadastrar novo fornecedor"
          onClick={() => openRegister(search.trim() || undefined)}
        >
          +
        </Button>
      </div>

      {showDropdown && (
        <div
          id={`${listId}-listbox`}
          role="listbox"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {loading && <p className="px-4 py-3 text-sm text-slate-500">Buscando…</p>}
          {showHint && (
            <p className="px-4 py-3 text-sm text-slate-500">Continue digitando para buscar…</p>
          )}
          {showEmpty && (
            <div className="px-4 py-4 text-center">
              <p className="text-sm text-slate-600">
                Nenhum fornecedor encontrado para &ldquo;{debouncedSearch}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => openRegister(debouncedSearch)}
                className="mt-2 text-sm font-medium text-brand hover:underline"
              >
                Cadastrar novo fornecedor
              </button>
            </div>
          )}
          {showResults && (
            <ul className="max-h-64 overflow-y-auto p-1">
              {results.map((s, index) => {
                const active = index === activeIndex;
                return (
                  <li key={s.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectSupplier(s)}
                      className={cn(
                        'flex w-full flex-col rounded-lg px-3 py-2.5 text-left transition',
                        active ? 'bg-brand-muted' : 'hover:bg-slate-50',
                      )}
                    >
                      <span className="truncate font-medium text-slate-900">{supplierLabel(s)}</span>
                      <span className="truncate text-xs text-slate-500">
                        {s.document || 'Sem documento'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {registerOpen && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <QuickSupplierRegister
            defaultName={search.trim() || debouncedSearch}
            onCreated={selectSupplier}
            onCancel={() => setRegisterOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
