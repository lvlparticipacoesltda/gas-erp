'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import {
  TIME_CLOCK_DAY_STATUS_LABELS,
  canManageSchedules,
  type AuthUser,
  type TimeClockDayStatus,
} from '@gas-erp/shared';
import { api, getToken } from '@/lib/api';
import { FilterBar, FilterField } from '@/components/filters';
import { Button, Card, Select } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';
import { TimeClockCardView, type TimeClockCard } from './time-clock-card-view';

type RoleFilter = 'deliverers' | 'attendants' | 'all';

interface CardsResponse {
  store: { id: string; name: string; cnpj: string | null; organizationName: string };
  year: number;
  month: number;
  cards: TimeClockCard[];
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

async function cardElementToPdfPage(
  pdf: jsPDF,
  el: HTMLElement,
  isFirstPage: boolean,
) {
  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
  });
  const imgData = canvas.toDataURL('image/png');
  const pageW = 210;
  const pageH = 297;
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = canvas.height / canvas.width;
  let w = maxW;
  let h = w * ratio;
  if (h > maxH) {
    h = maxH;
    w = h / ratio;
  }
  if (!isFirstPage) pdf.addPage();
  pdf.addImage(imgData, 'PNG', margin, margin, w, h);
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
  const [data, setData] = useState<CardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | TimeClockDayStatus>('all');
  const [exporting, setExporting] = useState(false);

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
      const res = await api<CardsResponse>(`/time-clock/cards?${params}`, {}, getToken());
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar cartões de ponto');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [canView, storeId, year, month, roleFilter, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const collaborators = useMemo(() => {
    return (data?.cards ?? [])
      .map((c) => [c.header.userId, c.header.userName] as const)
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [data?.cards]);

  const cards = useMemo(() => {
    const list = data?.cards ?? [];
    if (statusFilter === 'all') return list;
    return list.filter((card) => card.days.some((d) => d.status === statusFilter));
  }, [data?.cards, statusFilter]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  async function exportPdf(userIds: string[]) {
    if (exporting || userIds.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      let first = true;
      for (const id of userIds) {
        const el = document.querySelector<HTMLElement>(`[data-time-clock-card="${id}"]`);
        if (!el) continue;
        await cardElementToPdfPage(pdf, el, first);
        first = false;
      }
      if (first) {
        setError('Nenhum cartão disponível para exportar.');
        return;
      }
      const suffix =
        userIds.length === 1
          ? cards.find((c) => c.header.userId === userIds[0])?.header.userName.replace(/\s+/g, '-')
          : 'todos';
      pdf.save(`cartao-ponto-${year}-${String(month).padStart(2, '0')}-${suffix || 'export'}.pdf`);
    } catch {
      setError('Não foi possível gerar o PDF.');
    } finally {
      setExporting(false);
    }
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
        <Button
          type="button"
          variant="secondary"
          disabled={exporting || cards.length === 0}
          onClick={() => void exportPdf(cards.map((c) => c.header.userId))}
        >
          {exporting ? 'Gerando PDF…' : 'Exportar todos'}
        </Button>
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
        <PageLoader label="Carregando cartões de ponto…" />
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            {data?.store.name ? (
              <>
                Unidade <span className="font-medium text-slate-900">{data.store.name}</span>
                {' · '}
              </>
            ) : null}
            {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}
          </div>

          {cards.length === 0 ? (
            <Card className="p-8 text-center text-sm text-slate-500">
              Nenhum colaborador encontrado para os filtros selecionados.
            </Card>
          ) : (
            cards.map((card) => (
              <Card key={card.header.userId} className="overflow-x-auto p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {card.header.userName}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {card.header.jobTitle || card.header.roleLabel}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={exporting}
                    onClick={() => void exportPdf([card.header.userId])}
                  >
                    Exportar PDF
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <TimeClockCardView card={card} year={year} month={month} />
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
