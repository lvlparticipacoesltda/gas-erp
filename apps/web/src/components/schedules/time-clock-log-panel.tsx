'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { canManageSchedules, canViewTimeClockLog, type AuthUser } from '@gas-erp/shared';
import { api, getToken } from '@/lib/api';
import { FilterBar, FilterField } from '@/components/filters';
import { Button, Card, Select } from '@/components/ui';
import { PageLoader } from '@/components/brand-loader';
import { cn } from '@/lib/utils';
import {
  TimeClockCardView,
  type DayPunchSlots,
  type PunchSlotKey,
  type TimeClockCard,
} from './time-clock-card-view';

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

async function renderCardToCanvas(
  card: TimeClockCard,
  year: number,
  month: number,
): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = '794px';
  host.style.background = '#fff';
  host.style.zIndex = '-1';
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    await new Promise<void>((resolve) => {
      root.render(<TimeClockCardView card={card} year={year} month={month} />);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    // Garante layout completo antes do capture.
    await new Promise((r) => setTimeout(r, 40));
    const el = host.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Cartão não renderizado');
    return await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      width: 794,
      windowWidth: 794,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

async function appendCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement, isFirstPage: boolean) {
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
  const canView = canViewTimeClockLog(user.role, user.permissions);
  const canEdit = canManageSchedules(user.role);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const visibleStores = useMemo(() => {
    const list = stores ?? [];
    if (user.role === 'ORG_MASTER' || user.role === 'PLATFORM_ADMIN') return list;
    const allowed = new Set(user.storeIds ?? []);
    return list.filter((s) => allowed.has(s.id));
  }, [stores, user.role, user.storeIds]);
  const [storeId, setStoreId] = useState(
    fixedStoreId ?? visibleStores[0]?.id ?? stores?.[0]?.id ?? '',
  );
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(
    showRoleTabs ? 'deliverers' : 'all',
  );
  const [userId, setUserId] = useState('');
  const [data, setData] = useState<CardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (fixedStoreId) setStoreId(fixedStoreId);
  }, [fixedStoreId]);

  useEffect(() => {
    if (fixedStoreId) return;
    const list = visibleStores.length ? visibleStores : stores ?? [];
    if (list.length && !list.some((s) => s.id === storeId)) {
      setStoreId(list[0].id);
    }
  }, [fixedStoreId, visibleStores, stores, storeId]);

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

  const cards = data?.cards ?? [];

  const collaborators = useMemo(() => {
    return cards
      .map((c) => [c.header.userId, c.header.userName] as const)
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [cards]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  async function exportPdf() {
    if (exporting || cards.length === 0) return;
    setExporting(true);
    setError(null);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      for (let i = 0; i < cards.length; i += 1) {
        // PDF sempre sem modo edição.
        const canvas = await renderCardToCanvas(cards[i], year, month);
        await appendCanvasPage(pdf, canvas, i === 0);
      }
      const suffix =
        cards.length === 1
          ? cards[0].header.userName.replace(/\s+/g, '-')
          : 'todos';
      pdf.save(`cartao-ponto-${year}-${String(month).padStart(2, '0')}-${suffix || 'export'}.pdf`);
    } catch {
      setError('Não foi possível gerar o PDF.');
    } finally {
      setExporting(false);
    }
  }

  async function saveDayPunches(
    targetUserId: string,
    date: string,
    slot: PunchSlotKey,
    slots: DayPunchSlots,
  ) {
    if (!storeId || !canEdit) return;
    setSavingKey(`${date}:${slot}`);
    setError(null);
    try {
      const res = await api<{ card: TimeClockCard | null }>(
        '/time-clock/day',
        {
          method: 'PUT',
          body: JSON.stringify({
            storeId,
            userId: targetUserId,
            date,
            ent1: slots.ent1,
            sai1: slots.sai1,
            ent2: slots.ent2,
            sai2: slots.sai2,
          }),
        },
        getToken(),
      );
      if (res.card) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            cards: prev.cards.map((c) =>
              c.header.userId === targetUserId ? res.card! : c,
            ),
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar batida');
      throw err;
    } finally {
      setSavingKey(null);
    }
  }

  if (!canView) {
    return (
      <Card className="p-6 text-sm text-slate-600">
        Sem permissão para consultar o log de ponto.
      </Card>
    );
  }

  const storeOptions = visibleStores.length ? visibleStores : stores ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm font-medium text-brand hover:text-brand-dark"
        >
          ← Voltar
        </Link>
        <Button
          type="button"
          variant="secondary"
          disabled={exporting || cards.length === 0}
          onClick={() => void exportPdf()}
        >
          {exporting ? 'Gerando PDF…' : 'Exportar PDF'}
        </Button>
      </div>

      {!canEdit ? (
        <p className="text-sm text-slate-500">
          Visualização apenas — edição de batidas é restrita a master e gerente.
        </p>
      ) : null}

      <FilterBar>
        {showStoreFilter && storeOptions.length > 0 ? (
          <FilterField label="Unidade">
            <Select
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setUserId('');
              }}
              className="min-w-[180px]"
            >
              {storeOptions.map((s) => (
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
                <div className="mb-3 text-sm font-semibold text-slate-900">
                  {card.header.userName}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {card.header.jobTitle || card.header.roleLabel}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <TimeClockCardView
                    card={card}
                    year={year}
                    month={month}
                    editable={canEdit}
                    savingKey={savingKey}
                    onPunchEdit={
                      canEdit
                        ? ({ date, slot, slots }) =>
                            saveDayPunches(card.header.userId, date, slot, slots)
                        : undefined
                    }
                  />
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
