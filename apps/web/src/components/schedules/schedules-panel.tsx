'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SCHEDULE_DAY_TYPE_LABELS,
  canManageSchedules,
  type AuthUser,
  type ScheduleDayType,
} from '@gas-erp/shared';
import { api, getToken } from '@/lib/api';
import { FilterBar, FilterField } from '@/components/filters';
import { Button, Card, Input, Label, Select } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';

type RoleFilter = 'deliverers' | 'attendants' | 'all';

interface ScheduleEntry {
  id: string;
  date: string;
  dayType: ScheduleDayType;
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  notes: string | null;
  storeId?: string;
  storeName?: string;
}

interface CollaboratorRow {
  id: string;
  name: string;
  role: string;
  email: string;
  stores?: Array<{ id: string; name: string }>;
  entries: ScheduleEntry[];
}

interface MonthGrid {
  store: { id: string; name: string; latitude: number | null; longitude: number | null };
  year: number;
  month: number;
  daysInMonth: number;
  collaborators: CollaboratorRow[];
}

interface PunchMe {
  date: string;
  nextType: 'CLOCK_IN' | 'CLOCK_OUT';
  punches: Array<{ id: string; type: string; punchedAt: string; source: string }>;
  schedule: ScheduleEntry | null;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ROLE_SHORT: Record<string, string> = {
  DELIVERER: 'Entregador',
  ATTENDANT: 'Atendente',
  STORE_MANAGER: 'Gerente',
};

function cellClass(dayType: ScheduleDayType | undefined) {
  if (!dayType) return 'bg-slate-50 text-slate-300';
  if (dayType === 'WORK') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (dayType === 'HALF_DAY') return 'bg-amber-100 text-amber-900 border-amber-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

function cellLabel(entry: ScheduleEntry | undefined) {
  if (!entry) return '—';
  if (entry.dayType === 'DAY_OFF') return 'F';
  if (entry.startTime && entry.endTime) {
    return `${entry.startTime.slice(0, 5)}-${entry.endTime.slice(0, 5)}`;
  }
  return entry.dayType === 'HALF_DAY' ? '½' : 'T';
}

export function SchedulesPanel({
  user,
  storeId: fixedStoreId,
  stores,
  showStoreFilter,
  showRoleTabs,
  showPunchCard,
}: {
  user: AuthUser;
  storeId?: string;
  stores?: Array<{ id: string; name: string }>;
  showStoreFilter?: boolean;
  showRoleTabs?: boolean;
  showPunchCard?: boolean;
}) {
  const canEdit = canManageSchedules(user.role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [storeId, setStoreId] = useState(fixedStoreId ?? stores?.[0]?.id ?? '');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(
    showRoleTabs ? 'deliverers' : 'all',
  );
  const [grid, setGrid] = useState<MonthGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState<{
    userId: string;
    userName: string;
    date: string;
    entry?: ScheduleEntry;
    storeOptions: Array<{ id: string; name: string }>;
  } | null>(null);

  const [form, setForm] = useState({
    dayType: 'WORK' as ScheduleDayType,
    dayStoreId: '',
    startTime: '08:00',
    endTime: '17:00',
    breakEnabled: true,
    breakStart: '12:00',
    breakEnd: '13:00',
    notes: '',
  });

  const [punch, setPunch] = useState<PunchMe | null>(null);
  const [punching, setPunching] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetMonth, setCopyTargetMonth] = useState(month === 12 ? 1 : month + 1);
  const [copyTargetYear, setCopyTargetYear] = useState(month === 12 ? year + 1 : year);

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollLeftRef = useRef<number | null>(null);

  useEffect(() => {
    if (fixedStoreId) setStoreId(fixedStoreId);
  }, [fixedStoreId]);

  useEffect(() => {
    if (!fixedStoreId && stores?.length && !stores.some((s) => s.id === storeId)) {
      setStoreId(stores[0].id);
    }
  }, [fixedStoreId, stores, storeId]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!storeId) {
      setLoading(false);
      setError('Selecione uma unidade');
      return;
    }
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        storeId,
        year: String(year),
        month: String(month),
        roleFilter,
      });
      const data = await api<MonthGrid>(`/schedules?${params}`, {}, getToken());
      setGrid(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar escala');
      setGrid(null);
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [storeId, year, month, roleFilter]);

  useEffect(() => {
    if (pendingScrollLeftRef.current == null) return;
    const left = pendingScrollLeftRef.current;
    pendingScrollLeftRef.current = null;
    requestAnimationFrame(() => {
      if (tableScrollRef.current) {
        tableScrollRef.current.scrollLeft = left;
      }
    });
  }, [grid]);

  function captureTableScroll() {
    if (tableScrollRef.current) {
      pendingScrollLeftRef.current = tableScrollRef.current.scrollLeft;
    }
  }
  const loadPunch = useCallback(async () => {
    if (!showPunchCard || !storeId) return;
    try {
      const data = await api<PunchMe>(
        `/time-clock/me?storeId=${encodeURIComponent(storeId)}`,
        {},
        getToken(),
      );
      setPunch(data);
    } catch {
      setPunch(null);
    }
  }, [showPunchCard, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadPunch();
  }, [loadPunch]);

  const days = useMemo(
    () => Array.from({ length: grid?.daysInMonth ?? 0 }, (_, i) => i + 1),
    [grid?.daysInMonth],
  );

  function openCell(collab: CollaboratorRow, day: number) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const entry = collab.entries.find((e) => e.date === date);
    const storeOptions =
      collab.stores && collab.stores.length > 0
        ? collab.stores
        : stores?.length
          ? stores
          : storeId
            ? [{ id: storeId, name: grid?.store.name ?? 'Unidade' }]
            : [];
    const dayStoreId =
      entry?.storeId
      ?? (storeOptions.some((s) => s.id === storeId) ? storeId : storeOptions[0]?.id)
      ?? storeId;
    setSelected({
      userId: collab.id,
      userName: collab.name,
      date,
      entry,
      storeOptions,
    });
    setForm({
      dayType: entry?.dayType ?? 'WORK',
      dayStoreId,
      startTime: entry?.startTime?.slice(0, 5) ?? '08:00',
      endTime: entry?.endTime?.slice(0, 5) ?? '17:00',
      breakEnabled: Boolean(entry?.breakStart && entry?.breakEnd),
      breakStart: entry?.breakStart?.slice(0, 5) ?? '12:00',
      breakEnd: entry?.breakEnd?.slice(0, 5) ?? '13:00',
      notes: entry?.notes ?? '',
    });
  }

  async function saveDay() {
    if (!selected || !canEdit || !form.dayStoreId) return;
    setSaving(true);
    setError(null);
    try {
      await api(
        '/schedules/day',
        {
          method: 'PUT',
          body: JSON.stringify({
            storeId: form.dayStoreId,
            userId: selected.userId,
            date: selected.date,
            dayType: form.dayType,
            startTime: form.dayType === 'DAY_OFF' ? null : form.startTime,
            endTime: form.dayType === 'DAY_OFF' ? null : form.endTime,
            breakStart:
              form.dayType === 'DAY_OFF' || !form.breakEnabled ? null : form.breakStart,
            breakEnd:
              form.dayType === 'DAY_OFF' || !form.breakEnabled ? null : form.breakEnd,
            notes: form.notes.trim() || null,
          }),
        },
        getToken(),
      );
      setSelected(null);
      captureTableScroll();
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function deleteDay() {
    if (!selected?.entry || !canEdit) return;
    setSaving(true);
    try {
      await api(`/schedules/day/${selected.entry.id}`, { method: 'DELETE' }, getToken());
      setSelected(null);
      captureTableScroll();
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir');
    } finally {
      setSaving(false);
    }
  }

  async function copyMonth() {
    if (!canEdit || !storeId) return;
    setSaving(true);
    try {
      const result = await api<{ copied: number }>(
        '/schedules/copy',
        {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            sourceYear: year,
            sourceMonth: month,
            targetYear: copyTargetYear,
            targetMonth: copyTargetMonth,
          }),
        },
        getToken(),
      );
      setCopyOpen(false);
      setYear(copyTargetYear);
      setMonth(copyTargetMonth);
      setError(null);
      alert(`Copiados ${result.copied} dias para ${MONTH_NAMES[copyTargetMonth - 1]}/${copyTargetYear}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao copiar');
    } finally {
      setSaving(false);
    }
  }

  async function doPunch() {
    if (!punch || !storeId) return;
    setPunching(true);
    try {
      await api(
        '/time-clock/punch',
        {
          method: 'POST',
          body: JSON.stringify({
            storeId,
            type: punch.nextType,
            source: 'WEB',
          }),
        },
        getToken(),
      );
      await loadPunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao bater ponto');
    } finally {
      setPunching(false);
    }
  }

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <div className="space-y-4">
      {showPunchCard && punch ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50/40 p-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Meu ponto de hoje</div>
            <div className="mt-1 text-xs text-slate-600">
              {punch.punches.length === 0
                ? 'Nenhum registro ainda'
                : punch.punches
                    .map(
                      (p) =>
                        `${p.type === 'CLOCK_IN' ? 'Entrada' : 'Saída'} ${new Date(p.punchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
                    )
                    .join(' · ')}
            </div>
          </div>
          <Button onClick={() => void doPunch()} disabled={punching}>
            {punching
              ? 'Registrando…'
              : punch.nextType === 'CLOCK_IN'
                ? 'Bater entrada'
                : 'Bater saída'}
          </Button>
        </Card>
      ) : null}

      <FilterBar>
        {showStoreFilter && stores && stores.length > 0 ? (
          <FilterField label="Unidade">
            <Select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="min-w-[180px]"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FilterField>
        ) : null}

        <FilterField label="Mês">
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => shiftMonth(-1)}>
              ‹
            </Button>
            <span className="min-w-[140px] text-center text-sm font-medium">
              {MONTH_NAMES[month - 1]} / {year}
            </span>
            <Button type="button" variant="secondary" onClick={() => shiftMonth(1)}>
              ›
            </Button>
          </div>
        </FilterField>

        {showRoleTabs ? (
          <FilterField label="Colaboradores">
            <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ['deliverers', 'Entregadores'],
                  ['attendants', 'Atendentes'],
                ] as const
              ).map(([value, label]) => {
                const selectedRole = roleFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRoleFilter(value)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                      selectedRole
                        ? 'bg-brand text-white shadow-sm'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FilterField>
        ) : null}

        {canEdit ? (
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setCopyOpen(true)}>
              Copiar escala
            </Button>
          </div>
        ) : null}
      </FilterBar>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <PageLoader label="Carregando escala…" />
      ) : !grid ? (
        <Card className="p-6 text-sm text-slate-500">Nenhuma escala para exibir.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div ref={tableScrollRef} className="overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600">
                  <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium">
                    Colaborador
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      className="border-b border-slate-200 px-1 py-2 text-center font-medium"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.collaborators.map((collab) => (
                  <tr key={collab.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-3 py-2">
                      <div className="font-medium text-slate-900">{collab.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {ROLE_SHORT[collab.role] ?? collab.role}
                      </div>
                    </td>
                    {days.map((d) => {
                      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                      const entry = collab.entries.find((e) => e.date === date);
                      return (
                        <td key={d} className="border-b border-slate-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => openCell(collab, d)}
                            className={cn(
                              'flex h-10 w-full min-w-[52px] flex-col items-center justify-center rounded border text-[10px] leading-tight',
                              cellClass(entry?.dayType),
                              canEdit ? 'cursor-pointer hover:ring-2 hover:ring-brand-300' : 'cursor-default',
                            )}
                            title={
                              entry
                                ? SCHEDULE_DAY_TYPE_LABELS[entry.dayType]
                                : canEdit
                                  ? 'Clique para cadastrar'
                                  : 'Sem escala'
                            }
                          >
                            {cellLabel(entry)}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {grid.collaborators.length === 0 ? (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      Nenhum colaborador nesta unidade para o filtro selecionado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-200" /> Trabalho
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-200" /> Meia jornada
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-slate-200" /> Folga
            </span>
          </div>
        </Card>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <button
            type="button"
            className="flex-1 cursor-default"
            aria-label="Fechar"
            onClick={() => setSelected(null)}
          />
          <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-900">Detalhes da escala</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selected.userName} ·{' '}
                {new Date(selected.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                })}
              </p>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div>
                <Label>Unidade do dia</Label>
                <Select
                  value={form.dayStoreId}
                  disabled={!canEdit || selected.storeOptions.length === 0}
                  onChange={(e) => setForm((f) => ({ ...f, dayStoreId: e.target.value }))}
                >
                  {selected.storeOptions.length === 0 ? (
                    <option value="">Nenhuma unidade vinculada</option>
                  ) : (
                    selected.storeOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))
                  )}
                </Select>
                <p className="mt-1 text-xs text-slate-500">
                  Unidade em que o colaborador deve trabalhar / bater ponto neste dia.
                </p>
              </div>
              <div>
                <Label>Tipo de dia</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(Object.keys(SCHEDULE_DAY_TYPE_LABELS) as ScheduleDayType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setForm((f) => ({ ...f, dayType: t }))}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm',
                        form.dayType === t
                          ? 'border-brand-600 bg-brand-50 text-brand-800'
                          : 'border-slate-200 text-slate-600',
                        !canEdit && 'opacity-70',
                      )}
                    >
                      {SCHEDULE_DAY_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {form.dayType !== 'DAY_OFF' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Entrada</Label>
                      <Input
                        id="startTime"
                        type="time"
                        disabled={!canEdit}
                        value={form.startTime}
                        onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Saída</Label>
                      <Input
                        id="endTime"
                        type="time"
                        disabled={!canEdit}
                        value={form.endTime}
                        onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={form.breakEnabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, breakEnabled: e.target.checked }))
                      }
                    />
                    Intervalo
                  </label>
                  {form.breakEnabled ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Início</Label>
                        <Input
                          id="breakStart"
                          type="time"
                          disabled={!canEdit}
                          value={form.breakStart}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, breakStart: e.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Fim</Label>
                        <Input
                          id="breakEnd"
                          type="time"
                          disabled={!canEdit}
                          value={form.breakEnd}
                          onChange={(e) => setForm((f) => ({ ...f, breakEnd: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div>
                <Label>Observações</Label>
                <textarea
                  id="notes"
                  disabled={!canEdit}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 px-5 py-4">
              {canEdit ? (
                <>
                  <Button onClick={() => void saveDay()} disabled={saving} className="flex-1">
                    {saving ? 'Salvando…' : 'Salvar'}
                  </Button>
                  {selected.entry ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void deleteDay()}
                    >
                      Excluir dia
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button type="button" variant="secondary" onClick={() => setSelected(null)} className="flex-1">
                  Fechar
                </Button>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      {copyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-sm space-y-4 p-5">
            <h3 className="text-base font-semibold">Copiar escala do mês</h3>
            <p className="text-sm text-slate-600">
              Copia {MONTH_NAMES[month - 1]}/{year} para o mês de destino (mesmos dias do mês).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Mês destino</Label>
                <Select
                  value={String(copyTargetMonth)}
                  onChange={(e) => setCopyTargetMonth(Number(e.target.value))}
                >
                  {MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Ano destino</Label>
                <Input
                  type="number"
                  value={copyTargetYear}
                  onChange={(e) => setCopyTargetYear(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={saving} onClick={() => void copyMonth()}>
                Copiar
              </Button>
              <Button type="button" variant="secondary" onClick={() => setCopyOpen(false)}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
