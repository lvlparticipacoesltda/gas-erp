'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Input, Label } from '@/components/ui';
import {
  fetchAddressByCep,
  formatCep,
  normalizeCepDigits,
  searchAddressesByStreet,
  type ViaCepResponse,
} from '@/lib/viacep';

export interface CustomerAddressForm {
  zipCode: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
}

type AddressField = keyof CustomerAddressForm;

interface CustomerAddressFieldsProps {
  value: CustomerAddressForm;
  onChange: (value: CustomerAddressForm) => void;
}

const MIN_STREET_SEARCH = 3;
const STREET_DEBOUNCE_MS = 300;

export function customerAddressPayload(form: CustomerAddressForm) {
  return {
    street: form.street,
    number: form.number || undefined,
    neighborhood: form.neighborhood || undefined,
    city: form.city,
    state: form.state,
    zipCode: form.zipCode.replace(/\D/g, '') || undefined,
    isDefault: true,
  };
}

export function CustomerAddressFields({ value, onChange }: CustomerAddressFieldsProps) {
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const lastFetchedCep = useRef('');
  const numberRef = useRef<HTMLInputElement>(null);
  const streetContainerRef = useRef<HTMLDivElement>(null);
  const streetListId = useId();

  const [streetOpen, setStreetOpen] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [streetSuggestions, setStreetSuggestions] = useState<ViaCepResponse[]>([]);
  const [debouncedStreet, setDebouncedStreet] = useState('');
  const [streetActiveIndex, setStreetActiveIndex] = useState(0);

  const setField = useCallback(
    (field: AddressField, fieldValue: string) => {
      onChange({ ...value, [field]: fieldValue });
    },
    [onChange, value],
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedStreet(value.street.trim()), STREET_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value.street]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!streetContainerRef.current?.contains(e.target as Node)) {
        setStreetOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const city = value.city.trim();
    const state = value.state.trim().toUpperCase();
    if (
      !streetOpen ||
      debouncedStreet.length < MIN_STREET_SEARCH ||
      city.length < MIN_STREET_SEARCH ||
      state.length !== 2
    ) {
      setStreetSuggestions([]);
      setStreetLoading(false);
      return;
    }

    let cancelled = false;
    setStreetLoading(true);
    searchAddressesByStreet(state, city, debouncedStreet)
      .then((results) => {
        if (!cancelled) {
          setStreetSuggestions(results);
          setStreetActiveIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setStreetSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setStreetLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedStreet, value.city, value.state, streetOpen]);

  function applyStreetSuggestion(result: ViaCepResponse) {
    onChange({
      ...value,
      street: result.logradouro,
      neighborhood: result.bairro || value.neighborhood,
      city: result.localidade || value.city,
      state: result.uf || value.state,
      zipCode: result.cep ? formatCep(result.cep) : value.zipCode,
    });
    setStreetOpen(false);
    setStreetSuggestions([]);
    numberRef.current?.focus();
  }

  function handleStreetChange(raw: string) {
    setField('street', raw);
    setStreetOpen(true);
  }

  function onStreetKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!streetOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setStreetOpen(true);
      return;
    }
    if (e.key === 'Escape') {
      setStreetOpen(false);
      return;
    }
    if (!streetSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setStreetActiveIndex((i) => Math.min(i + 1, streetSuggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setStreetActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && streetOpen && streetSuggestions[streetActiveIndex]) {
      e.preventDefault();
      applyStreetSuggestion(streetSuggestions[streetActiveIndex]);
    }
  }

  async function lookupCep(rawCep: string) {
    const digits = normalizeCepDigits(rawCep);
    if (digits.length !== 8 || digits === lastFetchedCep.current) return;

    setCepLoading(true);
    setCepError('');
    try {
      const result = await fetchAddressByCep(digits);
      if (!result) {
        setCepError('CEP não encontrado.');
        lastFetchedCep.current = '';
        return;
      }

      lastFetchedCep.current = digits;
      onChange({
        ...value,
        zipCode: formatCep(digits),
        street: result.logradouro || value.street,
        neighborhood: result.bairro || value.neighborhood,
        city: result.localidade || value.city,
        state: result.uf || value.state,
      });
      numberRef.current?.focus();
    } catch {
      setCepError('Não foi possível consultar o CEP. Tente novamente.');
      lastFetchedCep.current = '';
    } finally {
      setCepLoading(false);
    }
  }

  function handleCepChange(raw: string) {
    const formatted = formatCep(raw);
    onChange({ ...value, zipCode: formatted });
    setCepError('');
    const digits = normalizeCepDigits(formatted);
    if (digits.length !== 8) {
      lastFetchedCep.current = '';
      return;
    }
    void lookupCep(formatted);
  }

  const canSearchStreet =
    value.city.trim().length >= MIN_STREET_SEARCH && value.state.trim().length === 2;
  const showStreetDropdown = streetOpen && value.street.length > 0;
  const showStreetHint =
    showStreetDropdown && !canSearchStreet && value.street.trim().length >= MIN_STREET_SEARCH;
  const showStreetLoading = showStreetDropdown && canSearchStreet && streetLoading;
  const showStreetEmpty =
    showStreetDropdown &&
    canSearchStreet &&
    !streetLoading &&
    debouncedStreet.length >= MIN_STREET_SEARCH &&
    streetSuggestions.length === 0;
  const showStreetResults =
    showStreetDropdown && canSearchStreet && !streetLoading && streetSuggestions.length > 0;

  return (
    <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-700">Endereço</p>

      <div>
        <Label>CEP</Label>
        <div className="relative">
          <Input
            value={value.zipCode}
            onChange={(e) => handleCepChange(e.target.value)}
            onBlur={() => lookupCep(value.zipCode)}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
            disabled={cepLoading}
          />
          {cepLoading && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              Buscando…
            </span>
          )}
        </div>
        {cepError ? <p className="mt-1 text-xs text-red-600">{cepError}</p> : null}
        <p className="mt-1 text-xs text-slate-500">Informe o CEP para preencher rua, bairro, cidade e UF.</p>
      </div>

      <div ref={streetContainerRef} className="relative">
        <Label>Logradouro</Label>
        <Input
          value={value.street}
          onChange={(e) => handleStreetChange(e.target.value)}
          onFocus={() => setStreetOpen(true)}
          onKeyDown={onStreetKeyDown}
          placeholder="Rua, avenida…"
          role="combobox"
          aria-expanded={showStreetDropdown}
          aria-controls={`${streetListId}-listbox`}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {showStreetDropdown && (
          <div
            id={`${streetListId}-listbox`}
            role="listbox"
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {showStreetHint && (
              <p className="px-3 py-2 text-xs text-slate-500">
                Informe cidade e UF para buscar o logradouro.
              </p>
            )}
            {showStreetLoading && (
              <p className="px-3 py-2 text-sm text-slate-500">Buscando endereços…</p>
            )}
            {showStreetEmpty && (
              <p className="px-3 py-2 text-sm text-slate-500">Nenhum endereço encontrado.</p>
            )}
            {showStreetResults &&
              streetSuggestions.map((result, index) => (
                <button
                  key={`${result.cep}-${result.logradouro}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === streetActiveIndex}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    index === streetActiveIndex ? 'bg-brand-muted/60' : ''
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyStreetSuggestion(result)}
                >
                  <span className="font-medium text-slate-900">{result.logradouro}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {[result.bairro, result.localidade, result.uf, formatCep(result.cep)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
          </div>
        )}
        <p className="mt-1 text-xs text-slate-500">
          Digite o logradouro para buscar sugestões (com cidade e UF preenchidos).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Número</Label>
          <Input
            ref={numberRef}
            value={value.number}
            onChange={(e) => setField('number', e.target.value)}
            placeholder="Nº"
          />
        </div>
        <div>
          <Label>Bairro</Label>
          <Input
            value={value.neighborhood}
            onChange={(e) => setField('neighborhood', e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
        <div>
          <Label>Cidade</Label>
          <Input value={value.city} onChange={(e) => setField('city', e.target.value)} />
        </div>
        <div>
          <Label>UF</Label>
          <Input
            value={value.state}
            onChange={(e) => setField('state', e.target.value.toUpperCase())}
            maxLength={2}
          />
        </div>
      </div>
    </div>
  );
}
