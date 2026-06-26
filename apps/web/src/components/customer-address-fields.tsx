'use client';

import { useCallback, useRef, useState } from 'react';
import { Input, Label } from '@/components/ui';
import { fetchAddressByCep, formatCep, normalizeCepDigits } from '@/lib/viacep';

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

  const setField = useCallback(
    (field: AddressField, fieldValue: string) => {
      onChange({ ...value, [field]: fieldValue });
    },
    [onChange, value],
  );

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

      <div>
        <Label>Logradouro</Label>
        <Input
          value={value.street}
          onChange={(e) => setField('street', e.target.value)}
          placeholder="Rua, avenida…"
        />
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
