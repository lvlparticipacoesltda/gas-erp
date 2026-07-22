'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, X, ChevronLeft, Store, Clock, User as UserIcon, Ban, PackageCheck, ShoppingBag } from 'lucide-react';
import { api, getToken } from '@/lib/api';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { useRealtimeRefetch } from '@/hooks/use-realtime-refetch';
import type { RealtimeChannel } from '@/lib/realtime';
import type { PaginatedResponse } from '@gas-erp/shared';
import { Pagination } from '@/components/pagination';
import { cn } from '@/lib/utils';

const ORG_CHANNEL: RealtimeChannel = { type: 'org' };

interface NotificationItemProduct {
  name: string;
  quantity: number;
}

interface NotificationMetadata {
  storeName?: string;
  attendantName?: string;
  total?: number;
  channel?: string;
  items?: NotificationItemProduct[];
  canceledReason?: string | null;
  canceledByName?: string;
  previousStatus?: string | null;
  at?: string;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  saleId?: string | null;
  storeId?: string | null;
  metadata?: NotificationMetadata | null;
  read: boolean;
  createdAt: string;
}

const PAGE_SIZE = 20;

function isCancelled(type: string) {
  return type === 'SALE_CANCELLED';
}

export function NotificationsCenter() {
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<NotificationItem | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const loadUnread = useCallback(() => {
    api<{ count: number }>('/notifications/unread-count', {}, getToken())
      .then((res) => setUnread(res.count))
      .catch(() => undefined);
  }, []);

  const loadList = useCallback((targetPage: number) => {
    setLoading(true);
    api<PaginatedResponse<NotificationItem>>(
      `/notifications?page=${targetPage}&pageSize=${PAGE_SIZE}`,
      {},
      getToken(),
    )
      .then((res) => {
        setItems(res.data);
        setTotalPages(res.totalPages);
        setTotal(res.total);
        if (targetPage > res.totalPages) {
          setPage(res.totalPages);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  // Contagem inicial + refetch em qualquer evento org (inclui notification_created).
  useEffect(() => {
    loadUnread();
  }, [loadUnread]);

  useRealtimeRefetch(
    ORG_CHANNEL,
    useCallback(() => {
      loadUnread();
      if (open) loadList(page);
    }, [loadUnread, loadList, open, page]),
    true,
  );

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    loadList(page);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open, page, loadList]);

  function openPanel() {
    setPage(1);
    setSelected(null);
    setOpen(true);
  }

  function close() {
    setEntered(false);
    setSelected(null);
    // Aguarda a transição antes de desmontar.
    setTimeout(() => setOpen(false), 200);
  }

  function markRead(item: NotificationItem) {
    if (item.read) return;
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    api(`/notifications/${item.id}/read`, { method: 'POST' }, getToken()).catch(() => undefined);
  }

  function openDetail(item: NotificationItem) {
    setSelected({ ...item, read: true });
    markRead(item);
  }

  function markAllRead() {
    if (unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    api('/notifications/read-all', { method: 'POST' }, getToken()).catch(() => undefined);
  }

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-sm transition hover:bg-brand-dark"
        aria-label="Central de mensagens"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex">
          <button
            type="button"
            aria-label="Fechar central de mensagens"
            onClick={close}
            className={cn(
              'absolute inset-0 bg-slate-900/40 transition-opacity duration-200',
              entered ? 'opacity-100' : 'opacity-0',
            )}
          />
          <aside
            className={cn(
              'relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-200 ease-out',
              entered ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            {selected ? (
              <NotificationDetail item={selected} onBack={() => setSelected(null)} onClose={close} />
            ) : (
              <>
                <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Central de mensagens</h2>
                    <p className="text-xs text-slate-500">
                      {unread > 0 ? `${unread} não lida(s)` : 'Tudo em dia'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={markAllRead}
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Marcar todas
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Fechar"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex-1 overflow-y-auto">
                    {loading && items.length === 0 ? (
                      <p className="p-6 text-center text-sm text-slate-400">Carregando…</p>
                    ) : items.length === 0 ? (
                      <p className="p-6 text-center text-sm text-slate-400">Nenhuma notificação ainda.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {items.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                            >
                              <span
                                className={cn(
                                  'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                                  isCancelled(item.type)
                                    ? 'bg-red-100 text-red-600'
                                    : 'bg-emerald-100 text-emerald-600',
                                )}
                              >
                                {isCancelled(item.type) ? (
                                  <Ban className="h-4 w-4" />
                                ) : (
                                  <PackageCheck className="h-4 w-4" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-slate-900">
                                    {item.title}
                                  </span>
                                  {!item.read && (
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Não lida" />
                                  )}
                                </span>
                                <span className="mt-0.5 block truncate text-sm text-slate-500">{item.body}</span>
                                <span className="mt-1 block text-xs text-slate-400">
                                  {formatDateTime(item.createdAt)}
                                </span>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <Pagination
                    className="shrink-0 border-t border-slate-100 px-4 py-3"
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    pageSize={PAGE_SIZE}
                    loading={loading}
                    onPageChange={setPage}
                  />
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

function NotificationDetail({
  item,
  onBack,
  onClose,
}: {
  item: NotificationItem;
  onBack: () => void;
  onClose: () => void;
}) {
  const meta = item.metadata ?? {};
  const cancelled = isCancelled(item.type);

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mb-5 flex items-center gap-3">
          <span
            className={cn(
              'inline-flex h-11 w-11 items-center justify-center rounded-full',
              cancelled ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600',
            )}
          >
            {cancelled ? <Ban className="h-5 w-5" /> : <PackageCheck className="h-5 w-5" />}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {cancelled ? 'Venda cancelada' : 'Venda portaria'}
            </h2>
            <p className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</p>
          </div>
        </div>

        <dl className="space-y-3 text-sm">
          <DetailRow icon={<Store className="h-4 w-4" />} label="Loja" value={meta.storeName ?? '—'} />
          <DetailRow
            icon={<UserIcon className="h-4 w-4" />}
            label="Atendente"
            value={meta.attendantName ?? '—'}
          />
          <DetailRow
            icon={<Clock className="h-4 w-4" />}
            label="Data e hora"
            value={formatDateTime(meta.at ?? item.createdAt)}
          />
          {meta.items && meta.items.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
              <span className="mt-0.5 text-slate-400">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Produto(s)
                </dt>
                <dd>
                  <ul className="mt-1 space-y-1 text-sm text-slate-800">
                    {meta.items.map((product, index) => (
                      <li key={`${product.name}-${index}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{product.name}</span>
                        <span className="shrink-0 font-medium text-slate-600">
                          {product.quantity}x
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </div>
          )}
          {typeof meta.total === 'number' && (
            <DetailRow
              icon={<PackageCheck className="h-4 w-4" />}
              label="Valor"
              value={formatCurrency(meta.total)}
            />
          )}
          {cancelled && (
            <>
              <DetailRow
                icon={<Ban className="h-4 w-4" />}
                label="Motivo"
                value={meta.canceledReason?.trim() || 'Sem motivo informado'}
              />
              {meta.canceledByName && (
                <DetailRow
                  icon={<UserIcon className="h-4 w-4" />}
                  label="Cancelada por"
                  value={meta.canceledByName}
                />
              )}
            </>
          )}
        </dl>
      </div>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
        <dd className="text-sm text-slate-800">{value}</dd>
      </div>
    </div>
  );
}
