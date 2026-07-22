'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SCHEDULE_DAY_TYPE_LABELS,
  TIME_CLOCK_DAY_STATUS_LABELS,
  canManageSchedules,
  type AuthUser,
  type ScheduleDayType,
  type TimeClockDayStatus,
} from '@gas-erp/shared';
import { api, getToken } from '@/lib/api';
import { FilterBar, FilterField } from '@/components/filters';
import { Badge, Button, Card, Select, Table } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';

type RoleFilter = 'deliverers' | 'attendants' | 'all';

interface ReportRow {
  userId: string;
  userName: string;
  userRole: string;
  date: string;
  dayType: ScheduleDayType | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  clockIn: string | null;
  clockOut: string | null;
  status: TimeClockDayStatus;
  statusLabel: string;
  sourceIn: string | null;
  sourceOut: string | null;
}

interface ReportResponse {
  store: { id: string; name: string };
  year: number;
  month: number;
  rows: ReportRow[];
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

function statusTone(status: TimeClockDayStatus): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'OK') return 'success';
  if (status === 'LATE' || status === 'INCOMPLETE' || status === 'OFF_SCHEDULE') return 'warning';
  if (status === 'ABSENT') return 'danger';
  return 'default';
}

export function TimeClockLogPanel({
  user,
  storeId: fixedStoreId,
  stores,
  showStoreFilter,
  showRoleTabs,
  backHref,
}: {
  user: AuthUser;
  storeId?: string;
  stores?: Array<{ id: string; name: string }>;
  showStoreFilter?: boolean;
  showRoleTabs?: boolean;
  backHref: string;
}) {
  const canView = canManageSchedules(user.role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [storeId, setStoreId] = useState(fixedStoreId ?? stores?.[0]?.id ?? '');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(
    showRoleTabs ? 'deliverers' : 'all',
  );
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | TimeClockDayStatus>('all');

  useEffect(() => {
    if (fixedStoreId) setStoreId(fixedStoreId);
  }, [fixedStoreId]);

  useEffect(() => {
    if (!fixedStoreId && stores?.length && !stores.some((s) => s.id === storeId)) {
      setStoreId(stores[0].id);
    }
  }, [fixedStoreId, stores, storeId]);

  const load = useCallback(async () => {
    if (!canView || !storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        storeId,
        year: String(year),
        month: String(month),
        roleFilter,
      });
      if (userId) params.set('userId', userId);
      const res = await api<ReportResponse>(`/time-clock/report?${params}`, {}, getToken());
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar log de ponto');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canView, storeId, year, month, roleFilter, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const collaborators = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of data?.rows ?? []) {
      map.set(row.userId, row.userName);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [data?.rows]);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (statusFilter === 'all') return list;
    return list.filter((r) => r.status === statusFilter);
  }, [data?.rows, statusFilter]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  if (!canView) {
    return (
      <Card className="p-6 text-sm text-slate-600">
        Apenas master ou gerente podem consultar o log de ponto.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          ← Voltar para escala
        </Link>
      </div>

      <FilterBar>
        {showStoreFilter && stores && stores.length > 0 ? (
          <FilterField label="Unidade">
            <Select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setUserId('');
              }}
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
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ['deliverers', 'Entregadores'],
                  ['attendants', 'Atendentes'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRoleFilter(value);
                    setUserId('');
                  }}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium',
                    roleFilter === value
                      ? 'bg-brand text-white'
                      : 'bg-white text-slate-700 border border-slate-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterField>
        ) : null}

        <FilterField label="Pessoa">
          <Select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="min-w-[160px]"
          >
            <option value="">Todos</option>
            {collaborators.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </FilterField>

        <FilterField label="Status">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="min-w-[140px]"
          >
            <option value="all">Todos</option>
            {(Object.keys(TIME_CLOCK_DAY_STATUS_LABELS) as TimeClockDayStatus[]).map((s) => (
              <option key={s} value={s}>
                {TIME_CLOCK_DAY_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <PageLoader label="Carregando log de ponto…" />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            {data?.store.name ? (
              <>
                Unidade <span className="font-medium text-slate-900">{data.store.name}</span>
                {' · '}
              </>
            ) : null}
            {rows.length} registro{rows.length === 1 ? '' : 's'}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Colaborador</th>
                  <th className="px-4 py-3 font-medium">Escala</th>
                  <th className="px-4 py-3 font-medium">Entrada</th>
                  <th className="px-4 py-3 font-medium">Saída</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.userId}-${row.date}`} className="border-t border-slate-100 text-sm">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                      {new Date(row.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.userName}</div>
                      <div className="text-xs text-slate-500">
                        {ROLE_SHORT[row.userRole] ?? row.userRole}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.dayType ? (
                        <>
                          <div>{SCHEDULE_DAY_TYPE_LABELS[row.dayType]}</div>
                          {row.dayType !== 'DAY_OFF' && row.scheduledStart && row.scheduledEnd ? (
                            <div className="text-xs text-slate-500">
                              {row.scheduledStart} – {row.scheduledEnd}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {row.clockIn ?? '—'}
                      {row.sourceIn ? (
                        <div className="text-[10px] text-slate-400">
                          {row.sourceIn === 'MOBILE' ? 'App' : 'Web'}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {row.clockOut ?? '—'}
                      {row.sourceOut ? (
                        <div className="text-[10px] text-slate-400">
                          {row.sourceOut === 'MOBILE' ? 'App' : 'Web'}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(row.status)}>{row.statusLabel}</Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                      Nenhum registro de escala ou ponto neste período.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
