import { z } from 'zod';

export const SCHEDULE_DAY_TYPES = ['WORK', 'HALF_DAY', 'DAY_OFF'] as const;
export type ScheduleDayType = (typeof SCHEDULE_DAY_TYPES)[number];

export const SCHEDULE_DAY_TYPE_LABELS: Record<ScheduleDayType, string> = {
  WORK: 'Trabalho',
  HALF_DAY: 'Meia jornada',
  DAY_OFF: 'Folga',
};

export const TIME_CLOCK_PUNCH_TYPES = ['CLOCK_IN', 'CLOCK_OUT'] as const;
export type TimeClockPunchType = (typeof TIME_CLOCK_PUNCH_TYPES)[number];

export const TIME_CLOCK_SOURCES = ['WEB', 'MOBILE'] as const;
export type TimeClockSource = (typeof TIME_CLOCK_SOURCES)[number];

/** Raio máximo (metros) para bater ponto pelo app do entregador. */
export const TIME_CLOCK_GEOFENCE_METERS = 500;

/** Tamanho máximo da foto JPEG em bytes (~400 KB). */
export const TIME_CLOCK_PHOTO_MAX_BYTES = 400 * 1024;

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
    if (data.dayType === 'DAY_OFF') return;
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
