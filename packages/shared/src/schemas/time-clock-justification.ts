import { z } from 'zod';

/**
 * Justificativa de ausência lançada sobre um período do cartão de ponto
 * (atestado médico, abono, falta justificada…).
 */
export const TIME_CLOCK_JUSTIFICATION_TYPES = [
  'ATESTADO_MEDICO',
  'DECLARACAO_COMPARECIMENTO',
  'ABONO_AUSENCIA',
  'FALTA_JUSTIFICADA',
] as const;

export type TimeClockJustificationType = (typeof TIME_CLOCK_JUSTIFICATION_TYPES)[number];

export const TIME_CLOCK_JUSTIFICATION_LABELS: Record<TimeClockJustificationType, string> = {
  ATESTADO_MEDICO: 'Atestado médico',
  DECLARACAO_COMPARECIMENTO: 'Declaração de comparecimento',
  ABONO_AUSENCIA: 'Abonar ausência no período',
  FALTA_JUSTIFICADA: 'Falta justificada',
};

/**
 * Tipos que abonam as horas: o tempo previsto coberto pelo período deixa de
 * contar como falta/atraso e passa para a coluna ABONO.
 *
 * `FALTA_JUSTIFICADA` documenta o motivo mas mantém o desconto — é o caso em que
 * o gestor aceita a explicação sem abonar a hora.
 */
export const TIME_CLOCK_JUSTIFICATION_ABONA: Record<TimeClockJustificationType, boolean> = {
  ATESTADO_MEDICO: true,
  DECLARACAO_COMPARECIMENTO: true,
  ABONO_AUSENCIA: true,
  FALTA_JUSTIFICADA: false,
};

export function justificationAbonaHoras(type: string): boolean {
  return TIME_CLOCK_JUSTIFICATION_ABONA[type as TimeClockJustificationType] ?? false;
}

/** Anexo do atestado (PDF ou imagem) guardado no banco, como a selfie do ponto. */
export const TIME_CLOCK_JUSTIFICATION_FILE_MAX_BYTES = 8 * 1024 * 1024;

export const TIME_CLOCK_JUSTIFICATION_FILE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:mm)');

export const createTimeClockJustificationSchema = z
  .object({
    storeId: z.string().min(1, 'Unidade obrigatória'),
    userId: z.string().min(1, 'Colaborador obrigatório'),
    type: z.enum(TIME_CLOCK_JUSTIFICATION_TYPES),
    notes: z.preprocess(
      (value) => (value === '' || value === null ? undefined : value),
      z.string().max(500).optional(),
    ),
    startDate: dateKey,
    startTime: hm.default('00:00'),
    endDate: dateKey,
    endTime: hm.default('23:59'),
    /** Base64 do anexo (com ou sem prefixo `data:`). */
    fileBase64: z.string().min(1).optional(),
    fileName: z.string().max(255).optional(),
    fileMimeType: z.enum(TIME_CLOCK_JUSTIFICATION_FILE_MIME_TYPES).optional(),
  })
  .refine(
    (data) =>
      `${data.startDate}T${data.startTime}` <= `${data.endDate}T${data.endTime}`,
    { message: 'O término não pode ser anterior ao início', path: ['endDate'] },
  )
  .refine((data) => !data.fileBase64 || Boolean(data.fileMimeType), {
    message: 'Informe o tipo do arquivo anexado',
    path: ['fileMimeType'],
  });

export const timeClockJustificationQuerySchema = z.object({
  storeId: z.string().min(1, 'Unidade obrigatória'),
  userId: z.string().min(1).optional(),
  dateFrom: dateKey.optional(),
  dateTo: dateKey.optional(),
});

export type CreateTimeClockJustificationInput = z.infer<
  typeof createTimeClockJustificationSchema
>;
export type TimeClockJustificationQuery = z.infer<typeof timeClockJustificationQuerySchema>;
