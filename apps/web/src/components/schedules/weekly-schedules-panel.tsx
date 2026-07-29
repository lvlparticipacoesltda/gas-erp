'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  WEEKDAY_LABELS,
  canManageSchedules,
  type AuthUser,
  type ScheduleDayType,
} from '@gas-erp/shared';
import { api, getToken } from '@/lib/api';
import { FilterBar, FilterField } from '@/components/filters';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';

type DayDraft = {
  weekday: number;
  dayType: ScheduleDayType;
  startTime: string;
  endTime: string;
  breakStart: string;
  breakEnd: string;
};

type WeeklyItem = {
  id: string;
  userId: string;
  storeId: string;
  storeName: string;
  name: string;
  active: boolean;
  type: string;
  summary: string;
  user: { id: string; name: string; role: string; email: string };
  days: Array<{
    weekday: number;
    dayType: ScheduleDayType;
    startTime: string | null;
    endTime: string | null;
    breakStart: string | null;
    breakEnd: string | null;
  }>;
};

type EligibleUser = { id: string; name: string; role: string; email: string };

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ROLE_LABEL: Record<string, string> = {
  DELIVERER: 'Entregador',
  ATTENDANT: 'Atendente',
  STORE_MANAGER: 'Gerente',
};

function emptyWeek(): DayDraft[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    dayType: weekday === 0 ? 'DAY_OFF' : 'WORK',
    startTime: '08:00',
    endTime: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
  }));
}

/** Segunda=1 … Domingo=0 no final da tabela (como no print). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function minutesBetween(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function dayTotalLabel(day: DayDraft): string {
  if (day.dayType === 'DAY_OFF') return '0:00';
  let total = 0;
  if (day.startTime && day.breakStart) total += Math.max(0, minutesBetween(day.startTime, day.breakStart));
  if (day.breakEnd && day.endTime) total += Math.max(0, minutesBetween(day.breakEnd, day.endTime));
  if ((!day.breakStart || !day.breakEnd) && day.startTime && day.endTime) {
    total = Math.max(0, minutesBetween(day.startTime, day.endTime));
  }
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function WeeklySchedulesPanel({
  user,
  storeId: fixedStoreId,
  stores,
  showStoreFilter,
}: {
  user: AuthUser;
  storeId?: string;
  stores?: Array<{ id: string; name: string }>;
  showStoreFilter?: boolean;
}) {
  const canEdit = canManageSchedules(user.role);
  const [storeId, setStoreId] = useState(fixedStoreId ?? stores?.[0]?.id ?? '');
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<WeeklyItem[]>([]);
  const [eligible, setEligible] = useState<EligibleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'list' | 'form'>('list');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formStoreId, setFormStoreId] = useState('');
  const [days, setDays] = useState<DayDraft[]>(emptyWeek);

  const now = new Date();
  const [applyYear, setApplyYear] = useState(now.getFullYear());
  const [applyMonth, setApplyMonth] = useState(now.getMonth() + 1);
  const [applyMsg, setApplyMsg] = useState<string | null>(null);

  useEffect(() => {
    if (fixedStoreId) setStoreId(fixedStoreId);
  }, [fixedStoreId]);

  useEffect(() => {
    if (!fixedStoreId && stores?.length && !stores.some((s) => s.id === storeId)) {
      setStoreId(stores[0].id);
    }
  }, [fixedStoreId, stores, storeId]);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      setError('Selecione uma unidade');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ storeId, status });
      if (q.trim()) params.set('q', q.trim());
      const data = await api<{ items: WeeklyItem[]; eligibleUsers: EligibleUser[] }>(
        `/schedules/weeklies?${params}`,
        {},
        getToken(),
      );
      setItems(data.items);
      setEligible(data.eligibleUsers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar horários');
      setItems([]);
      setEligible([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditingUserId(null);
    setFormUserId(eligible[0]?.id ?? '');
    setFormName(eligible[0]?.name ?? '');
    setFormActive(true);
    setFormStoreId(storeId);
    setDays(emptyWeek());
    setApplyMsg(null);
    setMode('form');
  }

  function openEdit(item: WeeklyItem) {
    setEditingUserId(item.userId);
    setFormUserId(item.userId);
    setFormName(item.name);
    setFormActive(item.active);
    setFormStoreId(item.storeId);
    const byWd = new Map(item.days.map((d) => [d.weekday, d]));
    setDays(
      emptyWeek().map((blank) => {
        const d = byWd.get(blank.weekday);
        if (!d) return blank;
        return {
          weekday: d.weekday,
          dayType: d.dayType,
          startTime: d.startTime?.slice(0, 5) ?? '08:00',
          endTime: d.endTime?.slice(0, 5) ?? '17:00',
          breakStart: d.breakStart?.slice(0, 5) ?? '12:00',
          breakEnd: d.breakEnd?.slice(0, 5) ?? '13:00',
        };
      }),
    );
    setApplyMsg(null);
    setMode('form');
  }

  function updateDay(weekday: number, patch: Partial<DayDraft>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  function copyDayDown(weekday: number) {
    const idx = DISPLAY_ORDER.indexOf(weekday);
    if (idx < 0 || idx >= DISPLAY_ORDER.length - 1) return;
    const source = days.find((d) => d.weekday === weekday);
    const targetWd = DISPLAY_ORDER[idx + 1];
    if (!source || targetWd == null) return;
    updateDay(targetWd, {
      dayType: source.dayType,
      startTime: source.startTime,
      endTime: source.endTime,
      breakStart: source.breakStart,
      breakEnd: source.breakEnd,
    });
  }

  async function persistWeekly(): Promise<string> {
    if (!canEdit || !formUserId || !formStoreId) {
      throw new Error('Preencha colaborador e unidade.');
    }
    await api(
      `/schedules/weeklies/${formUserId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          storeId: formStoreId,
          name: formName.trim() || 'Horário',
          active: formActive,
          days: days.map((d) => ({
            weekday: d.weekday,
            dayType: d.dayType === 'DAY_OFF' ? 'DAY_OFF' : 'WORK',
            startTime: d.dayType === 'DAY_OFF' ? null : d.startTime,
            endTime: d.dayType === 'DAY_OFF' ? null : d.endTime,
            breakStart: d.dayType === 'DAY_OFF' ? null : d.breakStart,
            breakEnd: d.dayType === 'DAY_OFF' ? null : d.breakEnd,
          })),
        }),
      },
      getToken(),
    );
    return formUserId;
  }

  async function saveForm() {
    if (!canEdit || !formUserId || !formStoreId) return;
    setSaving(true);
    setError(null);
    try {
      const userId = await persistWeekly();
      setEditingUserId(userId);
      await load();
      setApplyMsg('Horário salvo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar horário');
    } finally {
      setSaving(false);
    }
  }

  async function removeWeekly(userId: string) {
    if (!canEdit) return;
    if (!window.confirm('Remover este horário semanal? A escala já gerada não será apagada.')) return;
    setSaving(true);
    try {
      await api(`/schedules/weeklies/${userId}`, { method: 'DELETE' }, getToken());
      if (editingUserId === userId) setMode('list');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover');
    } finally {
      setSaving(false);
    }
  }

  async function applyToMonth() {
    if (!canEdit || !formUserId) {
      setError('Selecione o colaborador e salve o horário antes de aplicar.');
      return;
    }
    setSaving(true);
    setApplyMsg(null);
    setError(null);
    try {
      const userId = await persistWeekly();
      setEditingUserId(userId);
      const result = await api<{ created: number; skipped: number }>(
        `/schedules/weeklies/${userId}/apply`,
        {
          method: 'POST',
          body: JSON.stringify({
            year: applyYear,
            month: applyMonth,
            storeId: formStoreId || storeId,
          }),
        },
        getToken(),
      );
      await load();
      setApplyMsg(
        `Aplicado em ${MONTH_NAMES[applyMonth - 1]}/${applyYear}: ${result.created} dia(s) preenchido(s), ${result.skipped} já existente(s) mantido(s).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao aplicar horário');
    } finally {
      setSaving(false);
    }
  }

  const weekTotal = useMemo(
    () =>
      days.reduce((sum, d) => {
        const label = dayTotalLabel(d);
        const [h, m] = label.split(':').map(Number);
        return sum + h * 60 + m;
      }, 0),
    [days],
  );

  const userOptions = useMemo(() => {
    if (editingUserId) {
      const current = items.find((i) => i.userId === editingUserId);
      return current
        ? [{ id: current.userId, name: current.user.name, role: current.user.role, email: current.user.email }]
        : eligible;
    }
    return eligible;
  }, [editingUserId, items, eligible]);

  if (loading && mode === 'list') return <PageLoader label="Carregando horários…" />;

  if (mode === 'form') {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {editingUserId ? 'Editar horário' : 'Novo horário'}
            </h2>
            <p className="text-sm text-slate-500">Padrão semanal · preenche só dias vazios da escala</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => setMode('list')}>
            Voltar à lista
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {applyMsg ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {applyMsg}
          </div>
        ) : null}

        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Colaborador</Label>
              <Select
                value={formUserId}
                disabled={Boolean(editingUserId) || !canEdit}
                onChange={(e) => {
                  const id = e.target.value;
                  setFormUserId(id);
                  const u = userOptions.find((x) => x.id === id);
                  if (u) setFormName(u.name);
                }}
              >
                {userOptions.length === 0 ? (
                  <option value="">Nenhum disponível</option>
                ) : (
                  userOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({ROLE_LABEL[u.role] ?? u.role})
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div>
              <Label>Nome do horário</Label>
              <Input
                value={formName}
                disabled={!canEdit}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Select
                value={formStoreId}
                disabled={!canEdit || Boolean(fixedStoreId)}
                onChange={(e) => setFormStoreId(e.target.value)}
              >
                {(stores ?? [{ id: storeId, name: 'Unidade' }]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <div className="mt-2 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={formActive}
                    disabled={!canEdit}
                    onChange={() => setFormActive(true)}
                  />
                  Ativo
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!formActive}
                    disabled={!canEdit}
                    onChange={() => setFormActive(false)}
                  />
                  Inativo
                </label>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Dia</th>
                  <th className="px-3 py-2">Entrada 1</th>
                  <th className="px-3 py-2">Saída 1</th>
                  <th className="px-3 py-2">Entrada 2</th>
                  <th className="px-3 py-2">Saída 2</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Folga</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {DISPLAY_ORDER.map((weekday) => {
                  const day = days.find((d) => d.weekday === weekday)!;
                  const off = day.dayType === 'DAY_OFF';
                  return (
                    <tr key={weekday} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {WEEKDAY_LABELS[weekday]}
                      </td>
                      {(['startTime', 'breakStart', 'breakEnd', 'endTime'] as const).map((field) => (
                        <td key={field} className="px-2 py-1.5">
                          <Input
                            type="time"
                            className="h-9 w-[7.5rem]"
                            value={day[field]}
                            disabled={!canEdit || off}
                            onChange={(e) => updateDay(weekday, { [field]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 tabular-nums text-slate-600">{dayTotalLabel(day)}</td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={off}
                          disabled={!canEdit}
                          onChange={(e) =>
                            updateDay(weekday, {
                              dayType: e.target.checked ? 'DAY_OFF' : 'WORK',
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          title="Copiar para o dia abaixo"
                          disabled={!canEdit}
                          className="rounded px-2 py-1 text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                          onClick={() => copyDayDown(weekday)}
                        >
                          ↓
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                  <td className="px-3 py-2" colSpan={5}>
                    Total da semana
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {Math.floor(weekTotal / 60)}:{String(weekTotal % 60).padStart(2, '0')}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <Label>Aplicar ao mês</Label>
              <Select value={String(applyMonth)} onChange={(e) => setApplyMonth(Number(e.target.value))}>
                {MONTH_NAMES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Ano</Label>
              <Input
                type="number"
                className="w-28"
                value={applyYear}
                onChange={(e) => setApplyYear(Number(e.target.value))}
              />
            </div>
            <Button type="button" variant="secondary" disabled={!canEdit || saving} onClick={() => void applyToMonth()}>
              Aplicar (só dias vazios)
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!canEdit || saving || !formUserId} onClick={() => void saveForm()}>
              {saving ? 'Salvando…' : 'Salvar horário'}
            </Button>
            {editingUserId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!canEdit || saving}
                onClick={() => void removeWeekly(editingUserId)}
              >
                Excluir
              </Button>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterBar>
        {showStoreFilter && stores ? (
          <FilterField label="Unidade">
            <Select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FilterField>
        ) : null}
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive' | 'all')}
          >
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="all">Todos</option>
          </Select>
        </FilterField>
        <FilterField label="Buscar">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome…" />
        </FilterField>
        {canEdit ? (
          <div className="flex items-end">
            <Button type="button" disabled={eligible.length === 0} onClick={openCreate}>
              + Adicionar
            </Button>
          </div>
        ) : null}
      </FilterBar>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Nenhum horário cadastrado nesta unidade.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type}</td>
                    <td className="max-w-xl px-4 py-3 text-slate-600">{item.summary}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          item.active
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {item.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={() => openEdit(item)}>
                          Editar
                        </Button>
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void removeWeekly(item.userId)}
                          >
                            Excluir
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
