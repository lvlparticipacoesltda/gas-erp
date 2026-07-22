'use client';

import { Button, Input } from '@/components/ui';
import { FilterBar, FilterField } from '@/components/filters';
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
    <FilterBar className={cn('transition-opacity', disabled && 'pointer-events-none opacity-60')}>
      <FilterField label="De" htmlFor="summary-date-from">
        <Input
          id="summary-date-from"
          type="date"
          className="w-40 [color-scheme:light]"
          value={dateFrom}
          max={dateTo}
          disabled={disabled}
          onChange={(e) => handleFromChange(e.target.value)}
        />
      </FilterField>
      <FilterField label="Até" htmlFor="summary-date-to">
        <Input
          id="summary-date-to"
          type="date"
          className="w-40 [color-scheme:light]"
          value={dateTo}
          min={dateFrom}
          max={today}
          disabled={disabled}
          onChange={(e) => handleToChange(e.target.value)}
        />
      </FilterField>
      <div className="ml-auto flex flex-wrap items-center gap-2">
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
    </FilterBar>
  );
}
