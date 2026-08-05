'use client';

import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, formatPercent } from '@/lib/utils';
import { EXPENSE_CATEGORY_FALLBACK_COLOR } from '@gas-erp/shared';
import type { ExpenseSummary } from './types';

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** `2026-05` → `Mai/26`. */
function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${MONTH_SHORT[monthNumber - 1] ?? month}/${String(year).slice(2)}`;
}

function compactCurrency(value: number): string {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

/** O Tooltip do Recharts entrega `ValueType` (number | string | array). */
function tooltipCurrency(value: unknown): string {
  return formatCurrency(Number(value) || 0);
}

export function ExpensesByCategoryChart({ summary }: { summary: ExpenseSummary }) {
  const data = summary.byCategory.filter((row) => row.total > 0);

  if (data.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Nenhum gasto no período.</p>;
  }

  return (
    <div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={1}
              stroke="none"
            >
              {data.map((row) => (
                <Cell key={row.categoryId} fill={row.color ?? EXPENSE_CATEGORY_FALLBACK_COLOR} />
              ))}
            </Pie>
            <Tooltip
              formatter={tooltipCurrency}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 space-y-2">
        {data.map((row) => {
          const percent = summary.total > 0 ? (row.total / summary.total) * 100 : 0;
          return (
            <li key={row.categoryId} className="flex items-start gap-2 text-sm">
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color ?? EXPENSE_CATEGORY_FALLBACK_COLOR }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-slate-700">{row.name}</span>
                <span className="text-xs text-slate-500">
                  {formatCurrency(row.total)} ({formatPercent(percent)})
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ExpensesTrendChart({ summary }: { summary: ExpenseSummary }) {
  const data = summary.byMonth.map((row) => ({ ...row, label: monthLabel(row.month) }));

  if (data.every((row) => row.total === 0)) {
    return <p className="py-8 text-center text-sm text-slate-400">Sem histórico no período.</p>;
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={compactCurrency}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={tooltipCurrency}
            labelFormatter={(label) => `Mês ${String(label)}`}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3, fill: '#f97316' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
