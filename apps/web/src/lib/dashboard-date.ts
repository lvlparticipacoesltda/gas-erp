export function buildDashboardDateQuery(dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  if (dateFrom === dateTo) {
    params.set('date', dateFrom);
  } else {
    params.set('dateFrom', dateFrom);
    params.set('dateTo', dateTo);
  }
  return params.toString();
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
