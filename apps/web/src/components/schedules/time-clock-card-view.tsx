'use client';

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

  return (
    <div
      className={className}
      data-time-clock-card={header.userId}
      style={{
        width: '190mm',
        background: '#fff',
        color: '#111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        fontSize: '9px',
        lineHeight: 1.25,
        padding: '8px 10px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px', marginBottom: 4 }}>
        Cartão de Ponto — {MONTH_NAMES[month - 1]} / {year}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 6 }}>
        <tbody>
          <tr>
            <td style={{ padding: '2px 0' }}>
              <strong>Empresa:</strong> {header.companyName}
            </td>
            <td style={{ padding: '2px 0' }}>
              <strong>CNPJ:</strong> {cnpj}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0' }}>
              <strong>Funcionário:</strong> {header.userName}
            </td>
            <td style={{ padding: '2px 0' }}>
              <strong>Cargo:</strong> {header.jobTitle || header.roleLabel}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0' }}>
              <strong>CPF:</strong> {formatCpf(header.cpf)}
            </td>
            <td style={{ padding: '2px 0' }}>
              <strong>PIS:</strong> {header.pis || '—'}
            </td>
          </tr>
          <tr>
            <td style={{ padding: '2px 0' }}>
              <strong>Admissão:</strong> {formatDateBr(header.admittedAt)}
            </td>
            <td style={{ padding: '2px 0' }}>
              <strong>Unidade:</strong> {header.storeName}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontWeight: 700, marginBottom: 2 }}>Horário de trabalho</div>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          marginBottom: 8,
          border: '1px solid #333',
        }}
      >
        <thead>
          <tr>
            {['', ...horarioTrabalho.map((h) => h.weekday)].map((label) => (
              <th
                key={label || 'blank'}
                style={{
                  border: '1px solid #333',
                  padding: '2px 3px',
                  background: '#f3f3f3',
                  fontWeight: 700,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid #333', padding: '2px 3px', fontWeight: 700 }}>ENT.1</td>
            {horarioTrabalho.map((h) => (
              <td key={`${h.weekday}-e1`} style={{ border: '1px solid #333', padding: '2px 3px', textAlign: 'center' }}>
                {h.ent1 ?? (h.previsto === 'Folga' ? 'Folga' : '—')}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ border: '1px solid #333', padding: '2px 3px', fontWeight: 700 }}>SAÍ.1</td>
            {horarioTrabalho.map((h) => (
              <td key={`${h.weekday}-s1`} style={{ border: '1px solid #333', padding: '2px 3px', textAlign: 'center' }}>
                {h.sai1 ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ border: '1px solid #333', padding: '2px 3px', fontWeight: 700 }}>ENT.2</td>
            {horarioTrabalho.map((h) => (
              <td key={`${h.weekday}-e2`} style={{ border: '1px solid #333', padding: '2px 3px', textAlign: 'center' }}>
                {h.ent2 ?? '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ border: '1px solid #333', padding: '2px 3px', fontWeight: 700 }}>SAÍ.2</td>
            {horarioTrabalho.map((h) => (
              <td key={`${h.weekday}-s2`} style={{ border: '1px solid #333', padding: '2px 3px', textAlign: 'center' }}>
                {h.sai2 ?? '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #333' }}>
        <thead>
          <tr>
            {['DIA', 'PREVISTO', 'ENT.1', 'SAÍ.1', 'ENT.2', 'SAÍ.2', 'TOTAL', 'STATUS'].map((label) => (
              <th
                key={label}
                style={{
                  border: '1px solid #333',
                  padding: '2px 3px',
                  background: '#f3f3f3',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date}>
              <td style={{ border: '1px solid #333', padding: '1px 3px', whiteSpace: 'nowrap' }}>
                {String(day.day).padStart(2, '0')} {day.weekday}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', whiteSpace: 'nowrap' }}>
                {day.previsto}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', textAlign: 'center' }}>
                {day.ent1 ?? '—'}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', textAlign: 'center' }}>
                {day.sai1 ?? '—'}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', textAlign: 'center' }}>
                {day.ent2 ?? '—'}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', textAlign: 'center' }}>
                {day.sai2 ?? '—'}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', textAlign: 'center' }}>
                {day.totalNormais}
              </td>
              <td style={{ border: '1px solid #333', padding: '1px 3px', whiteSpace: 'nowrap' }}>
                {day.statusLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 8,
          borderTop: '1px solid #333',
          paddingTop: 6,
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
