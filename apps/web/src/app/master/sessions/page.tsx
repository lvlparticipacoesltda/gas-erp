'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { PaginatedSection } from '@/components/paginated-section';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/components/pagination';
import { api, getToken } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { ROLE_LABELS, type PaginatedResponse } from '@gas-erp/shared';

interface SessionRow {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  client: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  active: boolean;
  durationSeconds: number;
}

type SessionGroup = {
  userId: string;
  primary: SessionRow;
  /** Sessões encerradas do mesmo usuário já presentes na página atual. */
  pageHistory: SessionRow[];
};

/** Padrão: atendentes; todas as sessões (ativas + encerradas) para ver troca de IP. */
const emptyFilters = {
  search: '',
  active: '',
  audience: 'staff',
};

const CLIENT_LABELS: Record<string, string> = {
  web: 'Painel web',
  mobile: 'App móvel',
};

const REVOKE_LABELS: Record<string, string> = {
  replaced_by_new_login: 'Novo login (outro acesso)',
  ip_changed: 'IP alterado (mesmo login)',
  revoked_by_admin: 'Encerrada pelo master',
  logout: 'Logout',
  password_reset: 'Reset de senha',
};

const cell = 'border-r border-slate-200 px-3 py-2.5 align-top last:border-r-0';
const headCell = cn(cell, 'whitespace-nowrap bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600');

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 48) return remMins > 0 ? `${hours}h ${remMins}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function agentLabel(ua: string | null, client: string | null) {
  if (!ua) return '—';
  const lower = ua.toLowerCase();
  if (lower.includes('okhttp') || client === 'mobile') return 'App Android';
  if (lower.includes('iphone') || lower.includes('ipad')) return 'App iOS / Safari';
  if (lower.includes('edg/')) return 'Edge';
  if (lower.includes('chrome/') && !lower.includes('edg/')) return 'Chrome';
  if (lower.includes('firefox/')) return 'Firefox';
  if (lower.includes('safari/') && !lower.includes('chrome/')) return 'Safari';
  if (ua.length <= 40) return ua;
  return `${ua.slice(0, 40)}…`;
}

function byLastSeenDesc(a: SessionRow, b: SessionRow) {
  return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
}

/** Agrupa por usuário: ativa como principal; encerradas relacionadas ficam no histórico. */
function groupSessionsByUser(rows: SessionRow[]): SessionGroup[] {
  const byUser = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  const groups: SessionGroup[] = [];
  for (const [userId, sessions] of byUser) {
    const active = sessions.find((s) => s.active);
    const inactive = sessions.filter((s) => !s.active).sort(byLastSeenDesc);
    if (active) {
      groups.push({ userId, primary: active, pageHistory: inactive });
    } else if (inactive.length > 0) {
      const [primary, ...rest] = inactive;
      groups.push({ userId, primary, pageHistory: rest });
    }
  }

  groups.sort((a, b) => {
    if (a.primary.active !== b.primary.active) return a.primary.active ? -1 : 1;
    return byLastSeenDesc(a.primary, b.primary);
  });

  return groups;
}

export default function MasterSessionsPage() {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(() => new Set());
  const [historyByUser, setHistoryByUser] = useState<Record<string, SessionRow[]>>({});
  const [loadingHistoryUserId, setLoadingHistoryUserId] = useState<string | null>(null);

  const groups = useMemo(() => groupSessionsByUser(rows), [rows]);

  async function loadSessions() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      if (appliedFilters.active) params.set('active', appliedFilters.active);
      if (appliedFilters.audience) params.set('audience', appliedFilters.audience);
      const res = await api<PaginatedResponse<SessionRow>>(
        `/users/sessions?${params}`,
        {},
        getToken(),
      );
      setRows(res.data);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sessões');
      setRows([]);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }

  useEffect(() => {
    void loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, appliedFilters]);

  useEffect(() => {
    setExpandedUserIds(new Set());
    setHistoryByUser({});
    setLoadingHistoryUserId(null);
  }, [page, pageSize, appliedFilters]);

  function applyFilters() {
    setPage(1);
    setAppliedFilters(draftFilters);
  }

  function resetFilters() {
    setDraftFilters(emptyFilters);
    setPage(1);
    setAppliedFilters(emptyFilters);
  }

  async function revoke(session: SessionRow) {
    if (!session.active) return;
    if (!confirm(`Encerrar a sessão de ${session.userName}?`)) return;
    try {
      await api(`/users/sessions/${session.id}`, { method: 'DELETE' }, getToken());
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar sessão');
    }
  }

  function historyForGroup(group: SessionGroup): SessionRow[] {
    const fetched = historyByUser[group.userId];
    if (fetched) return fetched;
    return group.pageHistory;
  }

  async function toggleExpand(group: SessionGroup) {
    const { userId } = group;
    if (expandedUserIds.has(userId)) {
      setExpandedUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      return;
    }

    setExpandedUserIds((prev) => new Set(prev).add(userId));

    if (historyByUser[userId]) return;

    // Completa o histórico além da página atual (evidência de IP / logins anteriores).
    setLoadingHistoryUserId(userId);
    try {
      const params = new URLSearchParams({
        userId,
        active: 'false',
        page: '1',
        pageSize: '50',
      });
      if (appliedFilters.audience) params.set('audience', appliedFilters.audience);
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      const res = await api<PaginatedResponse<SessionRow>>(
        `/users/sessions?${params}`,
        {},
        getToken(),
      );
      const history = res.data
        .filter((s) => s.id !== group.primary.id && !s.active)
        .sort(byLastSeenDesc);
      setHistoryByUser((prev) => ({ ...prev, [userId]: history }));
    } catch (err) {
      // Mantém o que já veio na página se a busca falhar.
      setHistoryByUser((prev) => ({
        ...prev,
        [userId]: group.pageHistory,
      }));
      setError(err instanceof Error ? err.message : 'Erro ao carregar histórico da sessão');
    } finally {
      setLoadingHistoryUserId(null);
    }
  }

  function renderSessionCells(
    row: SessionRow,
    opts: { nested?: boolean; expandControl?: ReactNode },
  ) {
    const nested = opts.nested ?? false;
    return (
      <>
        <td className={cn(cell, 'min-w-[12rem]', nested && 'bg-slate-50/80')}>
          {nested ? (
            <div className="pl-4 text-xs text-slate-500">
              <span className="mr-1.5 text-slate-400">↳</span>
              Sessão anterior
            </div>
          ) : (
            <>
              <div className="font-medium text-slate-900">{row.userName}</div>
              <div className="mt-0.5 break-all text-xs text-slate-500">{row.userEmail}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {ROLE_LABELS[row.userRole as keyof typeof ROLE_LABELS] ?? row.userRole}
              </div>
            </>
          )}
        </td>
        <td className={cn(cell, 'whitespace-nowrap', nested && 'bg-slate-50/80')}>
          {row.active ? (
            <Badge tone="success">Ativa</Badge>
          ) : (
            <div className="space-y-1">
              <Badge>Encerrada</Badge>
              {row.revokeReason ? (
                <div className="max-w-[9rem] text-xs leading-snug text-slate-500">
                  {REVOKE_LABELS[row.revokeReason] ?? row.revokeReason}
                </div>
              ) : null}
            </div>
          )}
        </td>
        <td className={cn(cell, 'whitespace-nowrap text-slate-700', nested && 'bg-slate-50/80')}>
          {CLIENT_LABELS[row.client ?? ''] ?? row.client ?? '—'}
        </td>
        <td className={cn(cell, 'max-w-[12rem]', nested && 'bg-slate-50/80')}>
          <div className="break-all font-mono text-sm font-semibold leading-snug text-slate-900">
            {row.ipAddress ?? '—'}
          </div>
          {!row.active
          && (row.revokeReason === 'replaced_by_new_login'
            || row.revokeReason === 'ip_changed') ? (
            <div className="mt-1 text-[11px] font-medium text-amber-700">
              IP anterior / outro lugar
            </div>
          ) : null}
        </td>
        <td className={cn(cell, 'whitespace-nowrap text-slate-700', nested && 'bg-slate-50/80')}>
          {formatDateTime(row.createdAt)}
        </td>
        <td className={cn(cell, 'whitespace-nowrap text-slate-700', nested && 'bg-slate-50/80')}>
          {formatDateTime(row.lastSeenAt)}
        </td>
        <td className={cn(cell, 'whitespace-nowrap font-medium text-slate-800', nested && 'bg-slate-50/80')}>
          {formatDuration(row.durationSeconds)}
        </td>
        <td
          className={cn(cell, 'max-w-[8rem] text-xs text-slate-600', nested && 'bg-slate-50/80')}
          title={row.userAgent ?? undefined}
        >
          {agentLabel(row.userAgent, row.client)}
        </td>
        <td className={cn(cell, 'whitespace-nowrap text-right', nested && 'bg-slate-50/80')}>
          {opts.expandControl ?? (nested ? <span className="text-xs text-slate-400">—</span> : null)}
        </td>
      </>
    );
  }

  if (!ready) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Sessões"
        subtitle="Login único por conta — IP de cada acesso fica registrado; sessão antiga fica encerrada quando há novo login ou troca de IP"
      />

      <FilterPanel onSearch={applyFilters} onReset={resetFilters}>
        <div>
          <Label>Buscar</Label>
          <Input
            value={draftFilters.search}
            onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Nome ou e-mail"
          />
        </div>
        <div>
          <Label>Perfil</Label>
          <Select
            value={draftFilters.audience}
            onChange={(e) => setDraftFilters((f) => ({ ...f, audience: e.target.value }))}
          >
            <option value="staff">Atendentes</option>
            <option value="deliverer">Entregadores</option>
            <option value="">Todos</option>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select
            value={draftFilters.active}
            onChange={(e) => setDraftFilters((f) => ({ ...f, active: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="true">Ativas</option>
            <option value="false">Encerradas</option>
          </Select>
        </div>
      </FilterPanel>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <PaginatedSection
        loading={loading}
        pagination={{
          className: 'mt-4',
          page,
          totalPages,
          total,
          pageSize,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPage(1);
            setPageSize(size);
          },
        }}
      >
        <Table>
          <thead>
            <tr className="border-b border-slate-300">
              <th className={cn(headCell, 'min-w-[12rem]')}>Usuário</th>
              <th className={headCell}>Status</th>
              <th className={headCell}>Cliente</th>
              <th className={cn(headCell, 'min-w-[10rem]')}>IP / origem</th>
              <th className={headCell}>Login</th>
              <th className={headCell}>Última atividade</th>
              <th className={headCell}>Duração</th>
              <th className={cn(headCell, 'min-w-[7rem]')}>Agente</th>
              <th className={cn(headCell, 'text-right')}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  Nenhuma sessão encontrada.
                </td>
              </tr>
            ) : (
              groups.map((group) => {
                const expanded = expandedUserIds.has(group.userId);
                const history = historyForGroup(group);
                const loadingHistory = loadingHistoryUserId === group.userId;

                const expandControl = (
                  <TableActions>
                    {group.primary.active ? (
                      <TableAction onClick={() => void revoke(group.primary)}>Encerrar</TableAction>
                    ) : null}
                    <TableAction
                      tone="muted"
                      onClick={() => void toggleExpand(group)}
                      disabled={loadingHistory}
                    >
                      {expanded ? 'Recolher' : 'Expandir'}
                    </TableAction>
                  </TableActions>
                );

                return (
                  <Fragment key={group.userId}>
                    <tr
                      className={cn(
                        'border-b border-slate-200 odd:bg-white even:bg-slate-50/60',
                        group.primary.active && 'bg-emerald-50/40 odd:bg-emerald-50/50 even:bg-emerald-50/30',
                      )}
                    >
                      {renderSessionCells(group.primary, { expandControl })}
                    </tr>
                    {expanded ? (
                      loadingHistory ? (
                        <tr className="border-b border-slate-200">
                          <td colSpan={9} className="bg-slate-50/80 px-3 py-2.5 pl-8 text-xs text-slate-500">
                            Carregando histórico…
                          </td>
                        </tr>
                      ) : history.length === 0 ? (
                        <tr className="border-b border-slate-200">
                          <td colSpan={9} className="bg-slate-50/80 px-3 py-2.5 pl-8 text-xs text-slate-500">
                            Nenhuma sessão encerrada relacionada.
                          </td>
                        </tr>
                      ) : (
                        history.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-l-2 border-l-amber-200 border-slate-200"
                          >
                            {renderSessionCells(row, { nested: true })}
                          </tr>
                        ))
                      )
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </Table>
      </PaginatedSection>
    </>
  );
}
