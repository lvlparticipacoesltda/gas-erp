'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { TimeClockDayStatus } from '@gas-erp/shared';
import { formatCnpj } from '@/lib/utils';

export type PunchSlotKey = 'ent1' | 'sai1' | 'ent2' | 'sai2';

export type TimeClockCard = {
  header: {
    companyName: string;
    cnpj: string | null;
    storeName: string;
    userId: string;
    userName: string;
    cpf: string | null;
    pis: string | null;
    admittedAt: string | null;
    jobTitle: string | null;
    role: string;
    roleLabel: string;
  };
  horarioTrabalho: Array<{
    weekday: string;
    previsto: string;
    ent1: string | null;
    sai1: string | null;
    ent2: string | null;
    sai2: string | null;
  }>;
  days: Array<{
    date: string;
    day: number;
    weekday: string;
    previsto: string;
    ent1: string | null;
    sai1: string | null;
    ent2: string | null;
    sai2: string | null;
    hasPhotos?: boolean;
    totalNormais: string | null;
    totalNoturno?: string | null;
    diaFalta?: string | null;
    faltaEAtraso?: string | null;
    abono?: string | null;
    extra50d?: string | null;
    extraDiurna?: string | null;
    extraNoturna?: string | null;
    bancoTotal?: string | null;
    bancoSaldo?: string | null;
    status: TimeClockDayStatus;
    statusLabel: string;
  }>;
  totals: {
    totalNormais: string;
    totalNoturno?: string | null;
    diaFalta?: string | null;
    faltaEAtraso?: string | null;
    abono?: string | null;
    extra50d?: string | null;
    extraDiurna?: string | null;
    extraNoturna?: string | null;
    bancoTotal?: string | null;
    bancoSaldo?: string | null;
    faltas: number;
    atrasos: number;
  };
};

export type DayPunchSlots = {
  ent1: string | null;
  sai1: string | null;
  ent2: string | null;
  sai2: string | null;
};

const SLOT_KEYS: PunchSlotKey[] = ['ent1', 'sai1', 'ent2', 'sai2'];

const DAY_COLUMNS: Array<{
  key: string;
  label: ReactNode;
  align?: 'left' | 'center';
  /** Largura fixa; sem ela `table-layout: fixed` divide tudo em partes iguais. */
  width?: number;
}> = [
  { key: 'dia', label: 'DIA', align: 'left', width: 58 },
  // Cabe uma faixa por linha ("08:00-12:00" / "13:00-18:00"): com a divisão
  // igualitária o texto não cabia e vazava por cima das colunas de batida.
  { key: 'previsto', label: 'PREVISTO', align: 'left', width: 82 },
  { key: 'ent1', label: 'ENT.1', align: 'center' },
  { key: 'sai1', label: 'SAÍ.1', align: 'center' },
  { key: 'ent2', label: 'ENT.2', align: 'center' },
  { key: 'sai2', label: 'SAÍ.2', align: 'center' },
  { key: 'totalNormais', label: <>TOTAL<br />NORMAIS</>, align: 'center' },
  { key: 'totalNoturno', label: <>TOTAL<br />NOTURNO</>, align: 'center' },
  { key: 'diaFalta', label: <>DIA<br />FALTA</>, align: 'center' },
  { key: 'faltaEAtraso', label: <>FALTA E<br />ATRASO</>, align: 'center' },
  { key: 'abono', label: 'ABONO', align: 'center' },
  { key: 'extra50d', label: <>EXTRA<br />50%D</>, align: 'center' },
  { key: 'extraDiurna', label: <>EXTRA<br />DIURNA</>, align: 'center' },
  { key: 'extraNoturna', label: <>EXTRA<br />NOTURNA</>, align: 'center' },
  { key: 'bancoTotal', label: <>BANCO<br />TOTAL</>, align: 'center' },
  { key: 'bancoSaldo', label: <>BANCO<br />SALDO</>, align: 'center' },
];

/** Remove marcador (M) e normaliza para HH:mm ou null. */
export function punchDisplayToHm(value?: string | null): string | null {
  if (!value || value === '—') return null;
  const match = value.replace(/\(M\)/gi, '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function dayToPunchSlots(day: TimeClockCard['days'][number]): DayPunchSlots {
  return {
    ent1: punchDisplayToHm(day.ent1),
    sai1: punchDisplayToHm(day.sai1),
    ent2: punchDisplayToHm(day.ent2),
    sai2: punchDisplayToHm(day.sai2),
  };
}

/** Ao limpar um slot, zera os seguintes para manter a sequência válida. */
export function applySlotEdit(
  current: DayPunchSlots,
  slot: PunchSlotKey,
  value: string | null,
): DayPunchSlots {
  const next = { ...current, [slot]: value };
  if (value == null) {
    const idx = SLOT_KEYS.indexOf(slot);
    for (let i = idx + 1; i < SLOT_KEYS.length; i += 1) {
      next[SLOT_KEYS[i]] = null;
    }
  }
  return next;
}

function formatCpf(value?: string | null) {
  if (!value) return '—';
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length !== 11) return value;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatDateBr(value?: string | null) {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function cellValue(value?: string | null) {
  if (value == null || value === '') return '';
  return value;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Evita border-collapse (html2canvas corta texto nas bordas). */
const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  tableLayout: 'fixed',
};

const cellBase: CSSProperties = {
  borderTop: '1px solid #222',
  borderLeft: '1px solid #222',
  padding: '2px 3px',
  verticalAlign: 'middle',
  lineHeight: '1.2',
  background: '#fff',
  fontSize: 9,
  // Rede de segurança: com `table-layout: fixed` um conteúdo maior que a coluna
  // transborda por cima das vizinhas em vez de ser cortado.
  overflow: 'hidden',
  overflowWrap: 'anywhere',
};

function cellStyle(opts?: {
  lastCol?: boolean;
  lastRow?: boolean;
  header?: boolean;
  center?: boolean;
  nowrap?: boolean;
  editable?: boolean;
}): CSSProperties {
  return {
    ...cellBase,
    borderRight: opts?.lastCol ? '1px solid #222' : undefined,
    borderBottom: opts?.lastRow ? '1px solid #222' : undefined,
    background: opts?.header ? '#efefef' : opts?.editable ? '#fffbeb' : '#fff',
    fontWeight: opts?.header ? 700 : 400,
    textAlign: opts?.center ? 'center' : 'left',
    whiteSpace: opts?.nowrap ? 'nowrap' : 'normal',
    cursor: opts?.editable ? 'pointer' : undefined,
  };
}

function EditablePunchCell({
  display,
  editable,
  busy,
  style,
  onSave,
}: {
  display: string;
  editable: boolean;
  busy: boolean;
  style: CSSProperties;
  onSave: (value: string | null) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function startEdit() {
    if (!editable || busy) return;
    setDraft(punchDisplayToHm(display) ?? '');
    setEditing(true);
  }

  async function commit() {
    if (savingRef.current) return;
    const next = draft.trim() === '' ? null : punchDisplayToHm(draft.trim() || null);
    if (draft.trim() && !next) {
      return;
    }
    const prev = punchDisplayToHm(display);
    if (next === prev) {
      setEditing(false);
      return;
    }
    savingRef.current = true;
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      savingRef.current = false;
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <td style={{ ...style, padding: 1, background: '#fff' }}>
        <input
          ref={inputRef}
          type="time"
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={onKeyDown}
          style={{
            width: '100%',
            border: '1px solid #f59e0b',
            borderRadius: 3,
            padding: '1px 2px',
            fontSize: 9,
            textAlign: 'center',
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={style}
      onClick={startEdit}
      title={editable ? 'Clique para editar' : undefined}
    >
      {display}
    </td>
  );
}

export function TimeClockCardView({
  card,
  year,
  month,
  className,
  editable = false,
  savingKey = null,
  onPunchEdit,
  onViewPhotos,
}: {
  card: TimeClockCard;
  year: number;
  month: number;
  className?: string;
  /** Quando true, ENT/SAÍ do dia são editáveis (não usar no PDF). */
  editable?: boolean;
  savingKey?: string | null;
  onPunchEdit?: (args: {
    date: string;
    slot: PunchSlotKey;
    value: string | null;
    slots: DayPunchSlots;
  }) => Promise<void> | void;
  /** Botão de fotos à direita (só na tela web; omitir no PDF). */
  onViewPhotos?: (date: string) => void;
}) {
  const showPhotosCol = Boolean(onViewPhotos);
  const { header, horarioTrabalho, days, totals } = card;
  const cnpj = formatCnpj(header.cnpj) || '—';
  const weekCols = horarioTrabalho.length + 1;

  return (
    <div
      className={className}
      data-time-clock-card={header.userId}
      style={{
        width: 1100,
        maxWidth: '100%',
        background: '#fff',
        color: '#111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 10,
        lineHeight: 1.3,
        padding: 12,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        Cartão de Ponto — {MONTH_NAMES[month - 1]} / {year}
      </div>

      <table style={{ ...tableStyle, marginBottom: 8, tableLayout: 'auto' }}>
        <tbody>
          <tr>
            <td style={{ padding: '2px 0', width: '55%', fontSize: 10 }}>
              <strong>Empresa:</strong> {header.companyName}
            </td>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>CNPJ:</strong> {cnpj}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>Funcionário:</strong> {header.userName}
            </td>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>Cargo:</strong> {header.jobTitle || header.roleLabel}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>CPF:</strong> {formatCpf(header.cpf)}
            </td>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>PIS:</strong> {header.pis || '—'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>Admissão:</strong> {formatDateBr(header.admittedAt)}
            </td>
            <td style={{ padding: '2px 0', fontSize: 10 }}>
              <strong>Unidade:</strong> {header.storeName}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, marginBottom: 3, fontSize: 10 }}>Horário de trabalho</div>
      <table style={{ ...tableStyle, marginBottom: 10 }}>
        <thead>
          <tr>
            {['', ...horarioTrabalho.map((h) => h.weekday)].map((label, idx) => (
              <th
                key={label || 'blank'}
                style={cellStyle({
                  header: true,
                  center: true,
                  lastCol: idx === weekCols - 1,
                })}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['ENT.1', 'ent1'],
              ['SAÍ.1', 'sai1'],
              ['ENT.2', 'ent2'],
              ['SAÍ.2', 'sai2'],
            ] as const
          ).map(([label, key], rowIdx, rows) => (
            <tr key={label}>
              <td
                style={cellStyle({
                  header: true,
                  lastRow: rowIdx === rows.length - 1,
                })}
              >
                {label}
              </td>
              {horarioTrabalho.map((h, colIdx) => {
                const value =
                  key === 'ent1'
                    ? (h.ent1 ?? (h.previsto === 'Folga' ? 'Folga' : '—'))
                    : (h[key] ?? '—');
                return (
                  <td
                    key={`${h.weekday}-${key}`}
                    style={cellStyle({
                      center: true,
                      lastCol: colIdx === horarioTrabalho.length - 1,
                      lastRow: rowIdx === rows.length - 1,
                    })}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <table style={tableStyle}>
        <colgroup>
          {DAY_COLUMNS.map((col) => (
            <col key={col.key} style={col.width ? { width: col.width } : undefined} />
          ))}
          {showPhotosCol ? <col /> : null}
        </colgroup>
        <thead>
          <tr>
            {DAY_COLUMNS.map((col, idx) => (
              <th
                key={col.key}
                style={cellStyle({
                  header: true,
                  center: col.align !== 'left',
                  lastCol: !showPhotosCol && idx === DAY_COLUMNS.length - 1,
                })}
              >
                {col.label}
              </th>
            ))}
            {showPhotosCol ? (
              <th
                style={cellStyle({
                  header: true,
                  center: true,
                  lastCol: true,
                })}
              >
                FOTO
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {days.map((day, rowIdx) => {
            const lastRow = rowIdx === days.length - 1;
            const punchDisplays: Array<{ key: PunchSlotKey; value: string }> = [
              { key: 'ent1', value: day.ent1 ?? '—' },
              { key: 'sai1', value: day.sai1 ?? '—' },
              { key: 'ent2', value: day.ent2 ?? '—' },
              { key: 'sai2', value: day.sai2 ?? '—' },
            ];
            const metric = (v?: string | null) => cellValue(v);

            return (
              <tr key={day.date}>
                <td style={cellStyle({ nowrap: true, lastRow })}>
                  {String(day.day).padStart(2, '0')} {day.weekday}
                </td>
                {/* Sem `nowrap`: dias com intervalo trazem duas faixas e precisam quebrar. */}
                <td style={cellStyle({ lastRow })}>{day.previsto}</td>
                {punchDisplays.map(({ key, value }) => (
                  <EditablePunchCell
                    key={`${day.date}-${key}`}
                    display={value}
                    editable={editable}
                    busy={savingKey === `${day.date}:${key}` || savingKey === day.date}
                    style={cellStyle({
                      center: true,
                      nowrap: true,
                      lastRow,
                      editable,
                    })}
                    onSave={async (nextValue) => {
                      if (!onPunchEdit) return;
                      const slots = applySlotEdit(dayToPunchSlots(day), key, nextValue);
                      await onPunchEdit({ date: day.date, slot: key, value: nextValue, slots });
                    }}
                  />
                ))}
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.totalNormais)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.totalNoturno)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.diaFalta)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.faltaEAtraso)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.abono)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.extra50d)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.extraDiurna)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.extraNoturna)}</td>
                <td style={cellStyle({ center: true, lastRow })}>{metric(day.bancoTotal)}</td>
                <td
                  style={cellStyle({
                    center: true,
                    lastRow,
                    lastCol: !showPhotosCol,
                  })}
                >
                  {metric(day.bancoSaldo)}
                </td>
                {showPhotosCol ? (
                  <td style={cellStyle({ center: true, lastCol: true, lastRow })}>
                    {day.hasPhotos ? (
                      <button
                        type="button"
                        onClick={() => onViewPhotos?.(day.date)}
                        title="Ver fotos do ponto"
                        style={{
                          border: '1px solid #94a3b8',
                          background: '#f8fafc',
                          borderRadius: 4,
                          padding: '1px 6px',
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: '#0f172a',
                        }}
                      >
                        Ver
                      </button>
                    ) : (
                      ''
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 8,
          borderTop: '1px solid #222',
          paddingTop: 6,
          fontSize: 9,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <strong>TOTAIS:</strong>
          {' '}Normais {totals.totalNormais}
          {totals.totalNoturno ? ` · Noturno ${totals.totalNoturno}` : ''}
          {totals.diaFalta ? ` · Dia falta ${totals.diaFalta}` : ''}
          {totals.faltaEAtraso ? ` · Falta/atraso ${totals.faltaEAtraso}` : ''}
          {totals.extra50d ? ` · Extra 50%D ${totals.extra50d}` : ''}
          {totals.extraDiurna ? ` · Extra diurna ${totals.extraDiurna}` : ''}
          {totals.extraNoturna ? ` · Extra noturna ${totals.extraNoturna}` : ''}
          {totals.bancoTotal ? ` · Banco total ${totals.bancoTotal}` : ''}
          {totals.bancoSaldo ? ` · Banco saldo ${totals.bancoSaldo}` : ''}
          {` · Faltas ${totals.faltas} · Atrasos ${totals.atrasos}`}
        </div>
        <div style={{ color: '#444' }}>
          (M) = App móvel
          {editable ? ' · Clique nos horários para editar' : ''}
        </div>
      </div>
    </div>
  );
}
