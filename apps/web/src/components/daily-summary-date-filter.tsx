'use client';

import { Button, Input, Label } from '@/components/ui';
import { shiftDateKey } from '@/lib/dashboard-date';
import { cn } from '@/lib/utils';
import { todayDateKey } from '@gas-erp/shared';

interface DailySummaryDateFilterProps {
  dateFrom: string;
  dateTo: string;
  onChange: (dateFrom: string, dateTo: string) => void;
  disabled?: boolean;
}

export function DailySummaryDateFilter({ dateFrom, dateTo, onChange, disabled }: DailySummaryDateFilterProps) {
  const today = todayDateKey();

  function handleFromChange(value: string) {
    onChange(value, value > dateTo ? value : dateTo);
  }

  function handleToChange(value: string) {
    onChange(value < dateFrom ? value : dateFrom, value);
  }

  return (
    <div
      className={cn(
        'mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-opacity',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div>
        <Label>De</Label>
        <Input
          id="summary-date-from"
          type="date"
          className="mt-1"
          value={dateFrom}
          max={dateTo}
          disabled={disabled}
          onChange={(e) => handleFromChange(e.target.value)}
        />
      </div>
      <div>
        <Label>Até</Label>
        <Input
          id="summary-date-to"
          type="date"
          className="mt-1"
          value={dateTo}
          min={dateFrom}
          max={today}
          disabled={disabled}
          onChange={(e) => handleToChange(e.target.value)}
        />
      </div>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => onChange(today, today)}>
        Hoje
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          const yesterday = shiftDateKey(today, -1);
          onChange(yesterday, yesterday);
        }}
      >
        Ontem
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => onChange(shiftDateKey(today, -6), today)}
      >
        Últimos 7 dias
      </Button>
    </div>
  );
}
