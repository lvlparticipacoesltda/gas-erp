'use client';

import { useEffect, useState } from 'react';
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

/** Padrão: atendentes (painel), sem entregadores. */
const emptyFilters = {
  search: '',
  active: 'true',
  audience: 'staff',
};

const CLIENT_LABELS: Record<string, string> = {
  web: 'Painel web',
  mobile: 'App móvel',
};

const REVOKE_LABELS: Record<string, string> = {
  replaced_by_new_login: 'Substituída por novo login',
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

  if (!ready) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Sessões"
        subtitle="Login único por conta — veja sessões ativas, origem e tempo de uso"
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
            <option value="true">Ativas</option>
            <option value="false">Encerradas</option>
            <option value="">Todas</option>
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-slate-500">
                  Nenhuma sessão encontrada.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-200 odd:bg-white even:bg-slate-50/60">
                  <td className={cn(cell, 'min-w-[12rem]')}>
                    <div className="font-medium text-slate-900">{row.userName}</div>
                    <div className="mt-0.5 break-all text-xs text-slate-500">{row.userEmail}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {ROLE_LABELS[row.userRole as keyof typeof ROLE_LABELS] ?? row.userRole}
                    </div>
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap')}>
                    {row.active ? (
                      <Badge tone="success">Ativa</Badge>
                    ) : (
                      <div className="space-y-1">
                        <Badge>Encerrada</Badge>
                        {row.revokeReason ? (
                          <div className="max-w-[8rem] text-xs leading-snug text-slate-500">
                            {REVOKE_LABELS[row.revokeReason] ?? row.revokeReason}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap text-slate-700')}>
                    {CLIENT_LABELS[row.client ?? ''] ?? row.client ?? '—'}
                  </td>
                  <td className={cn(cell, 'max-w-[11rem] break-all font-mono text-xs leading-snug text-slate-700')}>
                    {row.ipAddress ?? '—'}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap text-slate-700')}>
                    {formatDateTime(row.createdAt)}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap text-slate-700')}>
                    {formatDateTime(row.lastSeenAt)}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap font-medium text-slate-800')}>
                    {formatDuration(row.durationSeconds)}
                  </td>
                  <td
                    className={cn(cell, 'max-w-[8rem] text-xs text-slate-600')}
                    title={row.userAgent ?? undefined}
                  >
                    {agentLabel(row.userAgent, row.client)}
                  </td>
                  <td className={cn(cell, 'whitespace-nowrap text-right')}>
                    {row.active ? (
                      <TableActions>
                        <TableAction onClick={() => void revoke(row)}>Encerrar</TableAction>
                      </TableActions>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </PaginatedSection>
    </>
  );
}
