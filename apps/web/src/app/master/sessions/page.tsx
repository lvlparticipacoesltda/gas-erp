'use client';

import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/brand-loader';
import { FilterPanel } from '@/components/filter-panel';
import { PaginatedSection } from '@/components/paginated-section';
import { TableAction, TableActions } from '@/components/table-actions';
import { Badge, Input, Label, PageHeader, Select, Table } from '@/components/ui';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/components/pagination';
import { api, getToken } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
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

const emptyFilters = {
  search: '',
  active: 'true',
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

function shortUserAgent(ua: string | null) {
  if (!ua) return '—';
  if (ua.length <= 72) return ua;
  return `${ua.slice(0, 72)}…`;
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
            <tr>
              <th>Usuário</th>
              <th>Status</th>
              <th>Cliente</th>
              <th>IP / origem</th>
              <th>Login</th>
              <th>Última atividade</th>
              <th>Duração</th>
              <th>Agente</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  Nenhuma sessão encontrada.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-medium text-slate-900">{row.userName}</div>
                    <div className="text-xs text-slate-500">{row.userEmail}</div>
                    <div className="text-xs text-slate-400">
                      {ROLE_LABELS[row.userRole as keyof typeof ROLE_LABELS] ?? row.userRole}
                    </div>
                  </td>
                  <td>
                    {row.active ? (
                      <Badge tone="success">Ativa</Badge>
                    ) : (
                      <div className="space-y-1">
                        <Badge>Encerrada</Badge>
                        {row.revokeReason ? (
                          <div className="text-xs text-slate-500">
                            {REVOKE_LABELS[row.revokeReason] ?? row.revokeReason}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td>{CLIENT_LABELS[row.client ?? ''] ?? row.client ?? '—'}</td>
                  <td className="font-mono text-xs">{row.ipAddress ?? '—'}</td>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(row.createdAt)}</td>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(row.lastSeenAt)}</td>
                  <td className="whitespace-nowrap text-sm">{formatDuration(row.durationSeconds)}</td>
                  <td className="max-w-[14rem] truncate text-xs text-slate-500" title={row.userAgent ?? undefined}>
                    {shortUserAgent(row.userAgent)}
                  </td>
                  <td>
                    {row.active ? (
                      <TableActions>
                        <TableAction onClick={() => void revoke(row)}>Encerrar</TableAction>
                      </TableActions>
                    ) : null}
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
