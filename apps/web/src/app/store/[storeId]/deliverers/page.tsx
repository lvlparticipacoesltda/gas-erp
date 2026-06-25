'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Label, PageHeader, Select, Table } from '@/components/ui';
import { api, getToken } from '@/lib/api';
import { DELIVERER_STATUS_LABELS } from '@gas-erp/shared';

interface DelivererStoreLink {
  storeId: string;
  store: { id: string; name: string };
}

interface Deliverer {
  id: string;
  status: string;
  user: { id: string; name: string; email: string; phone?: string };
  stores: DelivererStoreLink[];
}

interface StoreOption {
  id: string;
  name: string;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'default'> = {
  AVAILABLE: 'success',
  ON_DELIVERY: 'warning',
  OFFLINE: 'default',
};

export default function DeliverersPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [deliverers, setDeliverers] = useState<Deliverer[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [deliveriesCount, setDeliveriesCount] = useState(0);
  const [editing, setEditing] = useState<Deliverer | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api<Deliverer[]>(`/deliverers?storeId=${storeId}`, {}, getToken()),
      api<unknown[]>(`/deliveries?storeId=${storeId}`, {}, getToken()),
      api<StoreOption[]>('/stores', {}, getToken()),
    ]).then(([d, del, s]) => {
      setDeliverers(d);
      setDeliveriesCount(del.length);
      setStores(s);
    });
  }, [storeId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell mode="store">
      <PageHeader title="Entregadores" subtitle={`${deliveriesCount} entregas ativas hoje`} />
      <Table>
        <thead className="bg-slate-50 text-left">
          <tr>
            <th className="p-3">Nome</th>
            <th className="p-3">Telefone</th>
            <th className="p-3">Status</th>
            <th className="p-3">Unidades atendidas</th>
            <th className="p-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {deliverers.map((d) => (
            <tr key={d.id} className="border-t border-slate-100 align-top">
              <td className="p-3 font-medium text-slate-800">{d.user.name}</td>
              <td className="p-3">{d.user.phone ?? '-'}</td>
              <td className="p-3">
                <Badge tone={STATUS_TONE[d.status] ?? 'default'}>
                  {DELIVERER_STATUS_LABELS[d.status] ?? d.status}
                </Badge>
              </td>
              <td className="p-3">
                <div className="flex flex-wrap gap-1.5">
                  {d.stores.length === 0 ? (
                    <span className="text-slate-400">Nenhuma</span>
                  ) : (
                    d.stores.map((s) => (
                      <Badge key={s.storeId} tone="default">
                        {s.store.name}
                      </Badge>
                    ))
                  )}
                </div>
              </td>
              <td className="p-3 text-right">
                <Button variant="secondary" onClick={() => setEditing(d)}>
                  Editar
                </Button>
              </td>
            </tr>
          ))}
          {deliverers.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-slate-400">
                Nenhum entregador vinculado a esta unidade.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      {editing && (
        <EditDelivererModal
          deliverer={editing}
          stores={stores}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function EditDelivererModal({
  deliverer,
  stores,
  onClose,
  onSaved,
}: {
  deliverer: Deliverer;
  stores: StoreOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(deliverer.stores.map((s) => s.storeId)),
  );
  const [status, setStatus] = useState(deliverer.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0) {
      setError('Selecione ao menos uma unidade.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(
        `/deliverers/${deliverer.id}`,
        { method: 'PATCH', body: JSON.stringify({ storeIds: [...selected], status }) },
        getToken(),
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900">Editar entregador</h2>
        <p className="mt-1 text-sm text-slate-500">{deliverer.user.name}</p>

        <div className="mt-4">
          <Label>Unidades atendidas</Label>
          <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand"
                />
                {s.name}
              </label>
            ))}
            {stores.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-slate-400">Nenhuma unidade disponível.</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(DELIVERER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
