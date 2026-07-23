'use client';

import type { CSSProperties } from 'react';
import type { TimeClockDayStatus } from '@gas-erp/shared';
import { formatCnpj } from '@/lib/utils';

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
    totalNormais: string;
    status: TimeClockDayStatus;
    statusLabel: string;
  }>;
  totals: {
    totalNormais: string;
    faltas: number;
    atrasos: number;
  };
};

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
  padding: '4px 5px',
  verticalAlign: 'middle',
  lineHeight: '1.35',
  background: '#fff',
};

function cellStyle(opts?: {
  lastCol?: boolean;
  lastRow?: boolean;
  header?: boolean;
  center?: boolean;
  nowrap?: boolean;
}): CSSProperties {
  return {
    ...cellBase,
    borderRight: opts?.lastCol ? '1px solid #222' : undefined,
    borderBottom: opts?.lastRow ? '1px solid #222' : undefined,
    background: opts?.header ? '#efefef' : '#fff',
    fontWeight: opts?.header ? 700 : 400,
    textAlign: opts?.center ? 'center' : 'left',
    whiteSpace: opts?.nowrap ? 'nowrap' : 'normal',
  };
}

export function TimeClockCardView({
  card,
  year,
  month,
  className,
}: {
  card: TimeClockCard;
  year: number;
  month: number;
  className?: string;
}) {
  const { header, horarioTrabalho, days, totals } = card;
  const cnpj = formatCnpj(header.cnpj) || '—';
  const weekCols = horarioTrabalho.length + 1;
  const dayCols = 8;

  return (
    <div
      className={className}
      data-time-clock-card={header.userId}
      style={{
        width: 794,
        maxWidth: '100%',
        background: '#fff',
        color: '#111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: 11,
        lineHeight: 1.35,
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
        Cartão de Ponto — {MONTH_NAMES[month - 1]} / {year}
      </div>

      <table style={{ ...tableStyle, marginBottom: 10 }}>
        <tbody>
          <tr>
            <td style={{ padding: '3px 0', width: '55%' }}>
              <strong>Empresa:</strong> {header.companyName}
            </td>
            <td style={{ padding: '3px 0' }}>
              <strong>CNPJ:</strong> {cnpj}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '3px 0' }}>
              <strong>Funcionário:</strong> {header.userName}
            </td>
            <td style={{ padding: '3px 0' }}>
              <strong>Cargo:</strong> {header.jobTitle || header.roleLabel}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '3px 0' }}>
              <strong>CPF:</strong> {formatCpf(header.cpf)}
            </td>
            <td style={{ padding: '3px 0' }}>
              <strong>PIS:</strong> {header.pis || '—'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '3px 0' }}>
              <strong>Admissão:</strong> {formatDateBr(header.admittedAt)}
            </td>
            <td style={{ padding: '3px 0' }}>
              <strong>Unidade:</strong> {header.storeName}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, marginBottom: 4 }}>Horário de trabalho</div>
      <table style={{ ...tableStyle, marginBottom: 12 }}>
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
        <thead>
          <tr>
            {['DIA', 'PREVISTO', 'ENT.1', 'SAÍ.1', 'ENT.2', 'SAÍ.2', 'TOTAL', 'STATUS'].map(
              (label, idx) => (
                <th
                  key={label}
                  style={cellStyle({
                    header: true,
                    center: label !== 'DIA' && label !== 'PREVISTO' && label !== 'STATUS',
                    nowrap: true,
                    lastCol: idx === dayCols - 1,
                  })}
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {days.map((day, rowIdx) => {
            const lastRow = rowIdx === days.length - 1;
            const cells = [
              `${String(day.day).padStart(2, '0')} ${day.weekday}`,
              day.previsto,
              day.ent1 ?? '—',
              day.sai1 ?? '—',
              day.ent2 ?? '—',
              day.sai2 ?? '—',
              day.totalNormais,
              day.statusLabel,
            ];
            return (
              <tr key={day.date}>
                {cells.map((value, colIdx) => (
                  <td
                    key={`${day.date}-${colIdx}`}
                    style={cellStyle({
                      center: colIdx >= 2 && colIdx <= 6,
                      nowrap: colIdx === 0 || colIdx === 1 || colIdx === 7,
                      lastCol: colIdx === dayCols - 1,
                      lastRow,
                    })}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 10,
          borderTop: '1px solid #222',
          paddingTop: 8,
        }}
      >
        <div>
          <strong>Totais:</strong> Normais {totals.totalNormais}
          {' · '}
          Faltas {totals.faltas}
          {' · '}
          Atrasos {totals.atrasos}
        </div>
        <div style={{ color: '#444' }}>(M) = App móvel</div>
      </div>
    </div>
  );
}
