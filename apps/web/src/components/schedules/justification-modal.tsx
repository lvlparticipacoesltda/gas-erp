'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TIME_CLOCK_JUSTIFICATION_FILE_MAX_BYTES,
  TIME_CLOCK_JUSTIFICATION_LABELS,
  TIME_CLOCK_JUSTIFICATION_TYPES,
  justificationAbonaHoras,
  type TimeClockJustificationType,
} from '@gas-erp/shared';
import { api, apiBlobUrl, getToken } from '@/lib/api';
import { Modal } from '@/components/modal';
import { Button, Input, Label, Select, Table } from '@/components/ui';
import { useConfirm } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';

export interface Justification {
  id: string;
  userId: string;
  type: TimeClockJustificationType;
  typeLabel: string;
  abona: boolean;
  notes: string | null;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  hasFile: boolean;
  fileName: string | null;
  createdByName: string | null;
}

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function formatPeriod(item: Justification): string {
  const from = `${item.startDate.split('-').reverse().join('/')} ${item.startTime}`;
  const to = `${item.endDate.split('-').reverse().join('/')} ${item.endTime}`;
  return `${from} → ${to}`;
}

/** Lê o arquivo como base64 puro (sem o prefixo `data:`). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    reader.readAsDataURL(file);
  });
}

export function JustificationModal({
  open,
  onClose,
  storeId,
  userId,
  userName,
  date,
  canManage,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  userId: string;
  userName: string;
  /** Dia clicado na grade — pré-preenche início e término. */
  date: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<Justification[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [type, setType] = useState<TimeClockJustificationType>('ATESTADO_MEDICO');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(date);
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState(date);
  const [endTime, setEndTime] = useState('23:59');
  const [file, setFile] = useState<File | null>(null);

  const loadItems = useCallback(async () => {
    if (!open || !storeId || !userId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ storeId, userId });
      const res = await api<{ items: Justification[] }>(
        `/time-clock/justifications?${params}`,
        {},
        getToken(),
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar justificativas');
    } finally {
      setLoading(false);
    }
  }, [open, storeId, userId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  // Reabrir em outro dia repõe o formulário na data clicada.
  useEffect(() => {
    if (!open) return;
    setStartDate(date);
    setEndDate(date);
    setStartTime('00:00');
    setEndTime('23:59');
    setNotes('');
    setFile(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }, [open, date, userId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (`${startDate}T${startTime}` > `${endDate}T${endTime}`) {
      setError('O término não pode ser anterior ao início.');
      return;
    }
    if (file && file.size > TIME_CLOCK_JUSTIFICATION_FILE_MAX_BYTES) {
      setError(
        `Arquivo muito grande (máx. ${Math.round(
          TIME_CLOCK_JUSTIFICATION_FILE_MAX_BYTES / (1024 * 1024),
        )} MB).`,
      );
      return;
    }
    if (file && !ACCEPTED_MIME.includes(file.type)) {
      setError('Anexe um PDF ou uma imagem (JPG, PNG ou WEBP).');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        storeId,
        userId,
        type,
        notes: notes.trim() || undefined,
        startDate,
        startTime,
        endDate,
        endTime,
      };
      if (file) {
        body.fileBase64 = await readFileAsBase64(file);
        body.fileName = file.name;
        body.fileMimeType = file.type;
      }
      await api(
        '/time-clock/justifications',
        { method: 'POST', body: JSON.stringify(body) },
        getToken(),
      );
      toast.success('Justificativa lançada.', TIME_CLOCK_JUSTIFICATION_LABELS[type]);
      setNotes('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadItems();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao lançar justificativa');
    } finally {
      setSaving(false);
    }
  }

  /** Abre o anexo numa aba nova via blob — o token nunca entra na URL. */
  async function openAttachment(item: Justification) {
    try {
      const url = await apiBlobUrl(
        `/time-clock/justifications/${item.id}/file`,
        getToken(),
      );
      window.open(url, '_blank', 'noopener');
      // A aba já carregou o blob; liberar depois evita segurar memória à toa.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao abrir o anexo');
    }
  }

  async function handleDelete(item: Justification) {
    const ok = await confirm({
      title: 'Remover justificativa',
      description: `${item.typeLabel} · ${formatPeriod(item)}. O abono das horas volta a contar como falta.`,
      confirmLabel: 'Remover',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api(`/time-clock/justifications/${item.id}`, { method: 'DELETE' }, getToken());
      toast.success('Justificativa removida.');
      await loadItems();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Atestados e justificativas"
      subtitle={userName}
      size="xl"
    >
      {canManage ? (
        <form onSubmit={handleSubmit} className="space-y-3 border-b border-slate-200 pb-4">
          <div>
            <Label>Tipo</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as TimeClockJustificationType)}
            >
              {TIME_CLOCK_JUSTIFICATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TIME_CLOCK_JUSTIFICATION_LABELS[value]}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              {justificationAbonaHoras(type)
                ? 'Abona as horas: o previsto do período sai de falta/atraso e entra na coluna ABONO.'
                : 'Apenas documenta: as horas continuam contando como falta.'}
            </p>
          </div>

          <div>
            <Label>Justificativa</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={TIME_CLOCK_JUSTIFICATION_LABELS[type]}
              maxLength={500}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Início</Label>
                <Input
                  type="date"
                  className="[color-scheme:light]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Hora</Label>
                <Input
                  type="time"
                  className="[color-scheme:light]"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Término</Label>
                <Input
                  type="date"
                  className="[color-scheme:light]"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Hora</Label>
                <Input
                  type="time"
                  className="[color-scheme:light]"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <div>
            <Label>Anexo (atestado)</Label>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_MIME.join(',')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
            />
            <p className="mt-1 text-xs text-slate-500">
              PDF ou imagem, até{' '}
              {Math.round(TIME_CLOCK_JUSTIFICATION_FILE_MAX_BYTES / (1024 * 1024))} MB. Opcional.
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Adicionar justificativa'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="border-b border-slate-200 pb-3 text-sm text-slate-500">
          Visualização apenas — lançar justificativa é restrito a master e gerente.
        </p>
      )}

      <div className="pt-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Justificativas lançadas</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma justificativa para este colaborador.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <Table>
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-2">Período</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Justificativa</th>
                  <th className="p-2">Anexo</th>
                  {canManage ? <th className="p-2" /> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 text-sm">
                    <td className="p-2 whitespace-nowrap">{formatPeriod(item)}</td>
                    <td className="p-2">
                      {item.typeLabel}
                      <div className="text-xs text-slate-500">
                        {item.abona ? 'Abona horas' : 'Sem abono'}
                      </div>
                    </td>
                    <td className="p-2">{item.notes || '—'}</td>
                    <td className="p-2">
                      {item.hasFile ? (
                        <button
                          type="button"
                          onClick={() => void openAttachment(item)}
                          className="font-medium text-brand hover:underline"
                        >
                          {item.fileName || 'Abrir'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canManage ? (
                      <td className="p-2 text-right">
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => void handleDelete(item)}
                        >
                          Remover
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </Modal>
  );
}
