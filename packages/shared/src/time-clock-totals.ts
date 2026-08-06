/**
 * Totais do cartão de ponto (layout PDF fechamento).
 * Intervalos em minutos desde 00:00 do dia civil (0–1439+).
 * Noturno legal CLT: 22:00–05:00 (relógio, sem redução).
 */

export const TIME_CLOCK_LATE_GRACE_MINUTES = 10;

/** 22:00 */
export const NIGHT_START_MINUTES = 22 * 60;
/** 05:00 (no dia seguinte; representado como fim do trecho 00:00–05:00) */
export const NIGHT_END_MORNING_MINUTES = 5 * 60;

export type MinuteInterval = {
  /** Minutos desde 00:00 (pode ser > 1440 se atravessa meia-noite). */
  start: number;
  end: number;
};

export type TimeClockDayCalcInput = {
  /** Dia de trabalho na escala (não folga). */
  isWorkDay: boolean;
  /** Janelas previstas (ENT→SAÍ do intervalo / manhã+tarde). */
  scheduled: MinuteInterval[];
  /** Pares batidos (ent1→sai1, ent2→sai2). */
  worked: MinuteInterval[];
  /** Início previsto do dia (para atraso). */
  scheduledStartMinutes?: number | null;
  /** Fim previsto do dia (para saída antecipada). */
  scheduledEndMinutes?: number | null;
  /** Primeira batida de entrada (minutos). */
  firstInMinutes?: number | null;
  /** Última batida de saída (minutos). */
  lastOutMinutes?: number | null;
  lateGraceMinutes?: number;
  /**
   * Minutos do previsto cobertos por justificativa que abona (atestado, abono
   * de ausência…). Absorvem primeiro o DIA FALTA e depois FALTA E ATRASO,
   * migrando o tempo para a coluna ABONO.
   */
  abonoMinutes?: number;
};

export type TimeClockDayCalcResult = {
  totalNormaisMinutes: number;
  totalNoturnoMinutes: number;
  diaFaltaMinutes: number;
  faltaEAtrasoMinutes: number;
  abonoMinutes: number;
  extra50dMinutes: number;
  extraDiurnaMinutes: number;
  extraNoturnaMinutes: number;
  bancoTotalMinutes: number;
};

export function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const match = hm.trim().slice(0, 5).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Formato do PDF: `07,46`. */
export function formatMinutesComma(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')},${String(m).padStart(2, '0')}`;
}

/** Zero → null (célula vazia no cartão). */
export function formatMinutesCommaOrNull(totalMinutes: number): string | null {
  if (totalMinutes <= 0) return null;
  return formatMinutesComma(totalMinutes);
}

export function intervalDuration(interval: MinuteInterval): number {
  return Math.max(0, interval.end - interval.start);
}

/** Normaliza par start/end; se end < start, assume virada de dia. */
export function makeInterval(start: number, end: number): MinuteInterval | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end === start) return null;
  if (end < start) return { start, end: end + 24 * 60 };
  return { start, end };
}

export function sumIntervals(intervals: MinuteInterval[]): number {
  return intervals.reduce((sum, i) => sum + intervalDuration(i), 0);
}

/** Interseção de dois intervalos (minutos). */
export function intersectDuration(a: MinuteInterval, b: MinuteInterval): number {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return Math.max(0, end - start);
}

/**
 * Trechos noturnos cobrindo um intervalo que pode passar da meia-noite:
 * - 22:00–24:00 no dia D
 * - 00:00–05:00 no dia D
 * - 22:00–24:00+05:00 se o trabalho cruza meia-noite (via end > 1440)
 */
export function nightWindowsCovering(span: MinuteInterval): MinuteInterval[] {
  const day = 24 * 60;
  const windows: MinuteInterval[] = [];
  // Dia civil base (floor start/day)
  const baseDay = Math.floor(span.start / day) * day;
  for (let offset = -day; offset <= day; offset += day) {
    const origin = baseDay + offset;
    windows.push({ start: origin + NIGHT_START_MINUTES, end: origin + day }); // 22–24
    windows.push({ start: origin, end: origin + NIGHT_END_MORNING_MINUTES }); // 0–5
  }
  return windows;
}

export function nightOverlapMinutes(interval: MinuteInterval): number {
  let total = 0;
  for (const w of nightWindowsCovering(interval)) {
    total += intersectDuration(interval, w);
  }
  return total;
}

/** Minutos de `source` que caem dentro de algum `mask`. */
export function maskedMinutes(source: MinuteInterval[], mask: MinuteInterval[]): number {
  let total = 0;
  for (const s of source) {
    for (const m of mask) {
      total += intersectDuration(s, m);
    }
  }
  return total;
}

/**
 * Minutos de `source` fora de todas as máscaras (aproximação por grade de 1 min
 * seria pesada; usamos: duração − interseção com união das máscaras via varredura).
 */
export function outsideMinutes(source: MinuteInterval[], mask: MinuteInterval[]): number {
  let total = 0;
  for (const s of source) {
    total += intervalDuration(s) - clippedInside(s, mask);
  }
  return Math.max(0, total);
}

function clippedInside(source: MinuteInterval, mask: MinuteInterval[]): number {
  // Une interseções ordenando pontos (sweep simplificado para poucos intervalos).
  const parts: MinuteInterval[] = [];
  for (const m of mask) {
    const start = Math.max(source.start, m.start);
    const end = Math.min(source.end, m.end);
    if (end > start) parts.push({ start, end });
  }
  if (parts.length === 0) return 0;
  parts.sort((a, b) => a.start - b.start);
  const merged: MinuteInterval[] = [{ ...parts[0] }];
  for (let i = 1; i < parts.length; i += 1) {
    const last = merged[merged.length - 1];
    const cur = parts[i];
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end);
    else merged.push({ ...cur });
  }
  return sumIntervals(merged);
}

export function computeTimeClockDayTotals(input: TimeClockDayCalcInput): TimeClockDayCalcResult {
  const grace = input.lateGraceMinutes ?? TIME_CLOCK_LATE_GRACE_MINUTES;
  const scheduled = input.scheduled.filter((i) => intervalDuration(i) > 0);
  const worked = input.worked.filter((i) => intervalDuration(i) > 0);
  const scheduledMinutes = sumIntervals(scheduled);
  const workedTotal = sumIntervals(worked);

  const empty: TimeClockDayCalcResult = {
    totalNormaisMinutes: 0,
    totalNoturnoMinutes: 0,
    diaFaltaMinutes: 0,
    faltaEAtrasoMinutes: 0,
    abonoMinutes: 0,
    extra50dMinutes: 0,
    extraDiurnaMinutes: 0,
    extraNoturnaMinutes: 0,
    bancoTotalMinutes: 0,
  };

  // Folga: batidas (se houver) contam como extra; sem DIA FALTA.
  if (!input.isWorkDay) {
    if (workedTotal <= 0) return empty;
    const noturno = worked.reduce((s, i) => s + nightOverlapMinutes(i), 0);
    const extraNoturna = noturno;
    const extraDiurna = Math.max(0, workedTotal - extraNoturna);
    return {
      ...empty,
      totalNoturnoMinutes: Math.round(noturno),
      extraNoturnaMinutes: Math.round(extraNoturna),
      extraDiurnaMinutes: Math.round(extraDiurna),
      extra50dMinutes: Math.round(extraDiurna),
      bancoTotalMinutes: Math.round(extraDiurna + extraNoturna),
    };
  }

  // Falta integral
  if (workedTotal <= 0) {
    return applyAbono(
      {
        ...empty,
        diaFaltaMinutes: Math.round(scheduledMinutes),
      },
      input.abonoMinutes ?? 0,
    );
  }

  const totalNormais = maskedMinutes(worked, scheduled);
  const totalNoturno = worked.reduce((s, i) => s + nightOverlapMinutes(i), 0);

  // Extra = trabalhado fora das janelas previstas
  const extraBruto = outsideMinutes(worked, scheduled);
  // Parte noturna do extra: overlap do trabalho fora do previsto com noturno
  // Aprox: noturno total − noturno dentro do previsto
  const noturnoNoPrevisto = (() => {
    let n = 0;
    for (const w of worked) {
      for (const s of scheduled) {
        const start = Math.max(w.start, s.start);
        const end = Math.min(w.end, s.end);
        if (end > start) n += nightOverlapMinutes({ start, end });
      }
    }
    return n;
  })();
  const extraNoturna = Math.max(0, Math.min(extraBruto, totalNoturno - noturnoNoPrevisto));
  const extraDiurna = Math.max(0, extraBruto - extraNoturna);

  let faltaEAtraso = 0;
  const startExp = input.scheduledStartMinutes;
  const endExp = input.scheduledEndMinutes;
  const firstIn = input.firstInMinutes;
  const lastOut = input.lastOutMinutes;
  if (startExp != null && firstIn != null) {
    faltaEAtraso += Math.max(0, firstIn - startExp - grace);
  }
  if (endExp != null && lastOut != null) {
    faltaEAtraso += Math.max(0, endExp - lastOut);
  }

  const bancoTotal = extraDiurna + extraNoturna;

  return applyAbono(
    {
      totalNormaisMinutes: Math.round(totalNormais),
      totalNoturnoMinutes: Math.round(totalNoturno),
      diaFaltaMinutes: 0,
      faltaEAtrasoMinutes: Math.round(faltaEAtraso),
      abonoMinutes: 0,
      extra50dMinutes: Math.round(extraDiurna),
      extraDiurnaMinutes: Math.round(extraDiurna),
      extraNoturnaMinutes: Math.round(extraNoturna),
      bancoTotalMinutes: Math.round(bancoTotal),
    },
    input.abonoMinutes ?? 0,
  );
}

/**
 * Move para ABONO o tempo justificado, abatendo primeiro o dia de falta e
 * depois o atraso. O abono nunca cria saldo: sobra além do que era descontado
 * é simplesmente ignorada.
 */
function applyAbono(
  result: TimeClockDayCalcResult,
  abonoMinutes: number,
): TimeClockDayCalcResult {
  const available = Math.max(0, Math.round(abonoMinutes));
  if (available <= 0) return result;

  const onFalta = Math.min(available, result.diaFaltaMinutes);
  const onAtraso = Math.min(available - onFalta, result.faltaEAtrasoMinutes);

  return {
    ...result,
    diaFaltaMinutes: result.diaFaltaMinutes - onFalta,
    faltaEAtrasoMinutes: result.faltaEAtrasoMinutes - onAtraso,
    abonoMinutes: onFalta + onAtraso,
  };
}

/** Monta intervalos a partir de slots HH:mm (escala ou batidas). */
export function intervalsFromSlots(slots: {
  ent1?: string | null;
  sai1?: string | null;
  ent2?: string | null;
  sai2?: string | null;
}): MinuteInterval[] {
  const out: MinuteInterval[] = [];
  const a = parseHmToMinutes(slots.ent1);
  const b = parseHmToMinutes(slots.sai1);
  if (a != null && b != null) {
    const i = makeInterval(a, b);
    if (i) out.push(i);
  }
  const c = parseHmToMinutes(slots.ent2);
  const d = parseHmToMinutes(slots.sai2);
  if (c != null && d != null) {
    const i = makeInterval(c, d);
    if (i) out.push(i);
  }
  return out;
}
