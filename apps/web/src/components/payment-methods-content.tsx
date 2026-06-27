'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PageLoader } from '@/components/brand-loader';
import { Button, Card, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getStoredUser, getToken } from '@/lib/api';
import {
  PAYMENT_FEE_MODE_LABELS,
  PAYMENT_FEE_MODES,
  canManagePaymentMethods,
  type PaymentFeeModeValue,
} from '@gas-erp/shared';

interface StorePaymentMethodRow {
  id: string;
  label: string;
  systemCode: string | null;
  isCustom: boolean;
  enabled: boolean;
  sortOrder: number;
  feeMode: PaymentFeeModeValue;
  feePercent: number;
  feeFixed: number;
}

export function PaymentMethodsContent() {
  const { storeId } = useParams<{ storeId: string }>();
  const user = getStoredUser<{ role: string }>();
  const canManage = user ? canManagePaymentMethods(user.role) : false;

  const [methods, setMethods] = useState<StorePaymentMethodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newMethod, setNewMethod] = useState({
    label: '',
    feeMode: 'NONE' as PaymentFeeModeValue,
    feePercent: 0,
    feeFixed: 0,
  });

  async function loadMethods() {
    setLoading(true);
    setError('');
    try {
      const rows = await api<StorePaymentMethodRow[]>(
        `/stores/${storeId}/payment-methods`,
        {},
        getToken(),
      );
      setMethods(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar formas de pagamento');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMethods();
  }, [storeId]);

  async function updateMethod(id: string, patch: Partial<StorePaymentMethodRow>) {
    setSavingId(id);
    setError('');
    setMessage('');
    try {
      const updated = await api<StorePaymentMethodRow>(
        `/stores/${storeId}/payment-methods/${id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        getToken(),
      );
      setMethods((rows) => rows.map((row) => (row.id === id ? updated : row)));
      setMessage('Alterações salvas.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingId(null);
    }
  }

  async function createMethod(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const created = await api<StorePaymentMethodRow>(
        `/stores/${storeId}/payment-methods`,
        { method: 'POST', body: JSON.stringify(newMethod) },
        getToken(),
      );
      setMethods((rows) => [...rows, created]);
      setNewMethod({ label: '', feeMode: 'NONE', feePercent: 0, feeFixed: 0 });
      setMessage('Forma de pagamento criada.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar');
    } finally {
      setCreating(false);
    }
  }

  async function deleteMethod(row: StorePaymentMethodRow) {
    if (!window.confirm(`Excluir "${row.label}"?`)) return;
    setSavingId(row.id);
    setError('');
    setMessage('');
    try {
      await api(`/stores/${storeId}/payment-methods/${row.id}`, { method: 'DELETE' }, getToken());
      setMethods((rows) => rows.filter((item) => item.id !== row.id));
      setMessage('Forma de pagamento excluída.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir');
    } finally {
      setSavingId(null);
    }
  }

  if (!canManage) {
    return (
      <>
        <PageHeader title="Formas de pagamento" subtitle="Configuração indisponível para seu perfil" />
        <p className="text-sm text-slate-600">Apenas master, gerente e financeiro podem configurar taxas.</p>
        <Link href={`/store/${storeId}/settings`} className="mt-4 inline-block text-sm text-brand hover:underline">
          ← Voltar
        </Link>
      </>
    );
  }

  if (loading) return <PageLoader label="Carregando formas de pagamento…" />;

  return (
    <>
      <div className="mb-4">
        <Link href={`/store/${storeId}/settings`} className="text-sm text-brand hover:underline">
          ← Minha conta
        </Link>
      </div>
      <PageHeader
        title="Formas de pagamento"
        subtitle="Taxas de processamento e formas customizadas por loja"
      />

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {message && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

      <Card className="overflow-x-auto">
        <Table>
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="p-3">Ativa</th>
              <th className="p-3">Nome</th>
              <th className="p-3">Modo taxa</th>
              <th className="p-3">Taxa %</th>
              <th className="p-3">Taxa fixa</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {methods.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    disabled={savingId === row.id}
                    onChange={(e) => void updateMethod(row.id, { enabled: e.target.checked })}
                  />
                </td>
                <td className="p-3">
                  {row.isCustom ? (
                    <Input
                      value={row.label}
                      disabled={savingId === row.id}
                      onChange={(e) =>
                        setMethods((rows) =>
                          rows.map((item) => (item.id === row.id ? { ...item, label: e.target.value } : item)),
                        )
                      }
                      onBlur={(e) => {
                        const label = e.target.value.trim();
                        if (label && label !== row.label) void updateMethod(row.id, { label });
                      }}
                    />
                  ) : (
                    <span>{row.label}</span>
                  )}
                </td>
                <td className="p-3">
                  <Select
                    value={row.feeMode}
                    disabled={savingId === row.id}
                    onChange={(e) =>
                      void updateMethod(row.id, { feeMode: e.target.value as PaymentFeeModeValue })
                    }
                  >
                    {PAYMENT_FEE_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {PAYMENT_FEE_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="p-3">
                  {(row.feeMode === 'PERCENT' || row.feeMode === 'PERCENT_AND_FIXED') && (
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      className="w-24"
                      defaultValue={row.feePercent}
                      disabled={savingId === row.id}
                      onBlur={(e) => {
                        const feePercent = Number(e.target.value);
                        if (!Number.isNaN(feePercent)) void updateMethod(row.id, { feePercent });
                      }}
                    />
                  )}
                </td>
                <td className="p-3">
                  {(row.feeMode === 'FIXED' || row.feeMode === 'PERCENT_AND_FIXED') && (
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-28"
                      defaultValue={row.feeFixed}
                      disabled={savingId === row.id}
                      onBlur={(e) => {
                        const feeFixed = Number(e.target.value);
                        if (!Number.isNaN(feeFixed)) void updateMethod(row.id, { feeFixed });
                      }}
                    />
                  )}
                </td>
                <td className="p-3 text-right">
                  {row.isCustom ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={savingId === row.id}
                      onClick={() => void deleteMethod(row)}
                    >
                      Excluir
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Padrão</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 font-semibold">Adicionar forma customizada</h2>
        <form onSubmit={createMethod} className="grid gap-3 md:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <div>
            <Label>Nome</Label>
            <Input
              value={newMethod.label}
              onChange={(e) => setNewMethod({ ...newMethod, label: e.target.value })}
              required
            />
          </div>
          <div>
            <Label>Modo taxa</Label>
            <Select
              value={newMethod.feeMode}
              onChange={(e) =>
                setNewMethod({ ...newMethod, feeMode: e.target.value as PaymentFeeModeValue })
              }
            >
              {PAYMENT_FEE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {PAYMENT_FEE_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
          </div>
          {(newMethod.feeMode === 'PERCENT' || newMethod.feeMode === 'PERCENT_AND_FIXED') && (
            <div>
              <Label>Taxa %</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={newMethod.feePercent}
                onChange={(e) => setNewMethod({ ...newMethod, feePercent: Number(e.target.value) })}
              />
            </div>
          )}
          {(newMethod.feeMode === 'FIXED' || newMethod.feeMode === 'PERCENT_AND_FIXED') && (
            <div>
              <Label>Taxa fixa (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={newMethod.feeFixed}
                onChange={(e) => setNewMethod({ ...newMethod, feeFixed: Number(e.target.value) })}
              />
            </div>
          )}
          <div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Salvando…' : 'Adicionar'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
