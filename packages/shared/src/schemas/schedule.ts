import { z } from 'zod';
import { optionalId } from './helpers';

export const SCHEDULE_DAY_TYPES = ['WORK', 'HALF_DAY', 'DAY_OFF', 'VACATION'] as const;
export type ScheduleDayType = (typeof SCHEDULE_DAY_TYPES)[number];

export const SCHEDULE_DAY_TYPE_LABELS: Record<ScheduleDayType, string> = {
  WORK: 'Trabalho',
  HALF_DAY: 'Meia jornada',
  DAY_OFF: 'Folga',
  VACATION: 'Férias',
};

/** Dia sem jornada esperada (folga ou férias) — sem horário obrigatório / sem falta. */
export function isNonWorkingScheduleDay(dayType: ScheduleDayType | null | undefined): boolean {
  return dayType === 'DAY_OFF' || dayType === 'VACATION';
}

export const TIME_CLOCK_PUNCH_TYPES = ['CLOCK_IN', 'CLOCK_OUT'] as const;
export type TimeClockPunchType = (typeof TIME_CLOCK_PUNCH_TYPES)[number];

export const TIME_CLOCK_SOURCES = ['WEB', 'MOBILE'] as const;
export type TimeClockSource = (typeof TIME_CLOCK_SOURCES)[number];

/** Raio máximo (metros) para bater ponto pelo app do entregador. */
export const TIME_CLOCK_GEOFENCE_METERS = 500;

/**
 * Tamanho alvo da foto JPEG após compressão no servidor (~512 KB).
 * Usado na leitura/exibição; a compressão roda em background após gravar.
 */
export const TIME_CLOCK_PHOTO_MAX_BYTES = 512 * 1024;

/**
 * Tamanho máximo aceito no upload do app (foto da câmera sem compressão local).
 * ~5 MB binário ≈ ~6.7 MB em base64 no JSON.
 */
export const TIME_CLOCK_PHOTO_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const timeHm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:mm)')
  .optional()
  .nullable();

export const scheduleMonthQuerySchema = z.object({
  storeId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  /** Filtra colaboradores por papel: deliverers | attendants | all */
  roleFilter: z.enum(['deliverers', 'attendants', 'all']).default('all'),
});
export type ScheduleMonthQuery = z.infer<typeof scheduleMonthQuerySchema>;

export const upsertScheduleDaySchema = z
  .object({
    storeId: z.string().min(1),
    userId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
    dayType: z.enum(SCHEDULE_DAY_TYPES),
    startTime: timeHm,
    endTime: timeHm,
    breakStart: timeHm,
    breakEnd: timeHm,
    notes: z.string().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (isNonWorkingScheduleDay(data.dayType)) return;
    if (!data.startTime || !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe entrada e saída para dia de trabalho.',
        path: ['startTime'],
      });
    }
  });
export type UpsertScheduleDayInput = z.infer<typeof upsertScheduleDaySchema>;

export const copyScheduleSchema = z.object({
  storeId: z.string().min(1),
  sourceYear: z.coerce.number().int().min(2020).max(2100),
  sourceMonth: z.coerce.number().int().min(1).max(12),
  targetYear: z.coerce.number().int().min(2020).max(2100),
  targetMonth: z.coerce.number().int().min(1).max(12),
  /** Se informado, copia só deste usuário; senão, todos da loja no mês origem. */
  sourceUserId: z.string().min(1).optional(),
  /** Se informado com sourceUserId, copia para outro colaborador. */
  targetUserId: z.string().min(1).optional(),
});
export type CopyScheduleInput = z.infer<typeof copyScheduleSchema>;

/** Remove dias da escala do mês para os colaboradores da unidade (respeita roleFilter). */
export const clearScheduleSchema = z.object({
  storeId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  roleFilter: z.enum(['deliverers', 'attendants', 'all']).default('all'),
});
export type ClearScheduleInput = z.infer<typeof clearScheduleSchema>;

/** weekday: 0=Domingo … 6=Sábado (Date.getDay). */
export const WEEKDAY_LABELS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
] as const;

export const weeklyScheduleDaySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    dayType: z.enum(SCHEDULE_DAY_TYPES),
    startTime: timeHm,
    endTime: timeHm,
    breakStart: timeHm,
    breakEnd: timeHm,
  })
  .superRefine((data, ctx) => {
    if (isNonWorkingScheduleDay(data.dayType)) return;
    if (!data.startTime || !data.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Informe entrada 1 e saída 2 para dia de trabalho.',
        path: ['startTime'],
      });
    }
  });

export const upsertWeeklyScheduleSchema = z.object({
  storeId: z.string().min(1),
  name: z.string().min(1).max(120),
  active: z.boolean().default(true),
  days: z.array(weeklyScheduleDaySchema).length(7),
});
export type UpsertWeeklyScheduleInput = z.infer<typeof upsertWeeklyScheduleSchema>;

export const weeklyScheduleListQuerySchema = z.object({
  /** Opcional: sem storeId lista horários de todas as unidades acessíveis. */
  storeId: optionalId,
  /** active | inactive | all */
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  q: z.string().max(120).optional(),
});
export type WeeklyScheduleListQuery = z.infer<typeof weeklyScheduleListQuerySchema>;

export const applyWeeklyScheduleSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  /** Se informado, sobrescreve a loja de referência do template só nesta aplicação. */
  storeId: z.string().min(1).optional(),
});
export type ApplyWeeklyScheduleInput = z.infer<typeof applyWeeklyScheduleSchema>;

export const applyStoreWeekliesSchema = z.object({
  storeId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type ApplyStoreWeekliesInput = z.infer<typeof applyStoreWeekliesSchema>;

export const timeClockMeQuerySchema = z.object({
  storeId: z.string().min(1),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type TimeClockMeQuery = z.infer<typeof timeClockMeQuerySchema>;

export const timeClockHistoryQuerySchema = z.object({
  storeId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(1).optional(),
});
export type TimeClockHistoryQuery = z.infer<typeof timeClockHistoryQuerySchema>;

/** Relatório mensal: escala planejada × batidas de ponto. */
export const timeClockReportQuerySchema = z.object({
  storeId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  userId: z.string().min(1).optional(),
  roleFilter: z.enum(['deliverers', 'attendants', 'all']).default('all'),
});
export type TimeClockReportQuery = z.infer<typeof timeClockReportQuerySchema>;

/** Cartões de ponto (mesmo filtro do report flat). */
export const timeClockCardsQuerySchema = timeClockReportQuerySchema;
export type TimeClockCardsQuery = z.infer<typeof timeClockCardsQuerySchema>;

/** Fotos de batida de um dia (cartão de ponto na web). */
export const timeClockDayPhotosQuerySchema = z.object({
  storeId: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
});
export type TimeClockDayPhotosQuery = z.infer<typeof timeClockDayPhotosQuerySchema>;

/**
 * Dia completo no cartão = 2 entradas + 2 saídas (ENT.1/SAÍ.1/ENT.2/SAÍ.2).
 * Após isso o app/API não devem aceitar nova batida.
 */
export function isTimeClockDayComplete(
  punches: Array<{ type: TimeClockPunchType }>,
): boolean {
  let ins = 0;
  let outs = 0;
  for (const punch of punches) {
    if (punch.type === 'CLOCK_IN') ins += 1;
    else if (punch.type === 'CLOCK_OUT') outs += 1;
  }
  return ins >= 2 && outs >= 2;
}

export const TIME_CLOCK_PUNCH_SLOTS = ['ent1', 'sai1', 'ent2', 'sai2'] as const;
export type TimeClockPunchSlotKey = (typeof TIME_CLOCK_PUNCH_SLOTS)[number];

export const TIME_CLOCK_PUNCH_SLOT_LABELS: Record<TimeClockPunchSlotKey, string> = {
  ent1: 'ENT.1',
  sai1: 'SAÍ.1',
  ent2: 'ENT.2',
  sai2: 'SAÍ.2',
};

/** 1º CLOCK_IN → ENT.1, 1º CLOCK_OUT → SAÍ.1, 2º IN → ENT.2, 2º OUT → SAÍ.2. */
export function assignTimeClockPunchSlots<T extends { id: string; type: TimeClockPunchType; punchedAt: string | Date }>(
  punches: T[],
): Array<T & { slot: TimeClockPunchSlotKey; slotLabel: string }> {
  const ordered = [...punches].sort(
    (a, b) => new Date(a.punchedAt).getTime() - new Date(b.punchedAt).getTime(),
  );
  const ins = ordered.filter((p) => p.type === 'CLOCK_IN');
  const outs = ordered.filter((p) => p.type === 'CLOCK_OUT');
  const byId = new Map<string, TimeClockPunchSlotKey>();
  if (ins[0]) byId.set(ins[0].id, 'ent1');
  if (outs[0]) byId.set(outs[0].id, 'sai1');
  if (ins[1]) byId.set(ins[1].id, 'ent2');
  if (outs[1]) byId.set(outs[1].id, 'sai2');

  return ordered
    .map((punch) => {
      const slot = byId.get(punch.id);
      if (!slot) return null;
      return {
        ...punch,
        slot,
        slotLabel: TIME_CLOCK_PUNCH_SLOT_LABELS[slot],
      };
    })
    .filter((row): row is T & { slot: TimeClockPunchSlotKey; slotLabel: string } => row != null);
}

export const TIME_CLOCK_DAY_STATUSES = [
  'OK',
  'LATE',
  'ABSENT',
  'INCOMPLETE',
  'DAY_OFF',
  'OFF_SCHEDULE',
] as const;
export type TimeClockDayStatus = (typeof TIME_CLOCK_DAY_STATUSES)[number];

export const TIME_CLOCK_DAY_STATUS_LABELS: Record<TimeClockDayStatus, string> = {
  OK: 'Presente',
  LATE: 'Atraso',
  ABSENT: 'Ausente',
  INCOMPLETE: 'Sem saída',
  DAY_OFF: 'Folga',
  OFF_SCHEDULE: 'Fora da escala',
};

export const timeClockPunchSchema = z.object({
  storeId: z.string().min(1),
  type: z.enum(TIME_CLOCK_PUNCH_TYPES),
  source: z.enum(TIME_CLOCK_SOURCES),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
  /** JPEG em base64 (sem prefixo data:); obrigatório no MOBILE. */
  photoBase64: z.string().min(1).optional(),
});
export type TimeClockPunchInput = z.infer<typeof timeClockPunchSchema>;

const optionalHmOrNull = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}, z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:mm)')
  .nullable()
  .optional());

/** Edição manual dos 4 slots do dia (master/gerente). */
export const upsertTimeClockDaySchema = z.object({
  storeId: z.string().min(1),
  userId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  ent1: optionalHmOrNull,
  sai1: optionalHmOrNull,
  ent2: optionalHmOrNull,
  sai2: optionalHmOrNull,
});
export type UpsertTimeClockDayInput = z.infer<typeof upsertTimeClockDaySchema>;
