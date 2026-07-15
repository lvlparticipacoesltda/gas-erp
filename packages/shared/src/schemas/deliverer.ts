import { z } from 'zod';
import { DELIVERER_STATUSES } from '../enums';

export const createDelivererSchema = z
  .object({
    userId: z.string().min(1).optional(),
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    password: z.string().min(6).optional(),
    storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade'),
    status: z.enum(DELIVERER_STATUSES).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.userId) return;
    if (!data.name) {
      ctx.addIssue({ code: 'custom', message: 'Nome obrigatório', path: ['name'] });
    }
    if (!data.email) {
      ctx.addIssue({ code: 'custom', message: 'E-mail obrigatório', path: ['email'] });
    }
    if (!data.password) {
      ctx.addIssue({ code: 'custom', message: 'Senha obrigatória', path: ['password'] });
    }
  });

export const updateDelivererSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(6).optional(),
  storeIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos uma unidade').optional(),
  status: z.enum(DELIVERER_STATUSES).optional(),
  /**
   * Unidade em que o entregador fica disponível no mapa.
   * Obrigatório ao marcar AVAILABLE se o entregador atende mais de uma unidade.
   */
  availableStoreId: z.string().min(1).nullable().optional(),
  /** Desativa o login no app (User.active) e marca entregador como offline. */
  active: z.boolean().optional(),
});

export type CreateDelivererInput = z.infer<typeof createDelivererSchema>;
export type UpdateDelivererInput = z.infer<typeof updateDelivererSchema>;

export const delivererPositionStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const delivererPendingDeliverySchema = z.object({
  id: z.string(),
  /** Quando a rota foi direcionada ao entregador (criação da entrega). */
  assignedAt: z.string(),
  customerName: z.string().nullable(),
  deliveryAddress: z.string().nullable(),
});

export const updateDelivererPositionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  batteryCharging: z.boolean().optional(),
});

export const delivererPositionSchema = z.object({
  delivererId: z.string(),
  name: z.string(),
  /** Status persistido no cadastro (AVAILABLE | ON_DELIVERY | OFFLINE). */
  status: z.enum(DELIVERER_STATUSES),
  /** Unidade em que está disponível no mapa (escopo por loja). */
  availableStoreId: z.string().nullable().optional(),
  delivererStatus: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  updatedAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  stale: z.boolean(),
  isLive: z.boolean(),
  batteryLevel: z.number().int().min(0).max(100).nullable().optional(),
  batteryCharging: z.boolean().nullable().optional(),
  deliveryId: z.string().nullable().optional(),
  deliveryStatus: z.string().nullable().optional(),
  /** Início da rota ativa (ISO), para exibir tempo em rota no mapa. */
  routeStartedAt: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  deliveryAddress: z.string().nullable().optional(),
  /** Rotas direcionadas ao entregador ainda não iniciadas (PENDING). */
  pendingDeliveries: z.array(delivererPendingDeliverySchema).optional(),
  stores: z.array(delivererPositionStoreSchema),
});

export const delivererPositionsResponseSchema = z.array(delivererPositionSchema);

export type UpdateDelivererPositionInput = z.infer<typeof updateDelivererPositionSchema>;
export type DelivererPendingDelivery = z.infer<typeof delivererPendingDeliverySchema>;

export const delivererMeStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  street: z.string().nullable(),
  number: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  landmark: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  /** Texto livre legado, se houver. */
  address: z.string().nullable(),
});

export const delivererMeSchema = z.object({
  id: z.string(),
  status: z.enum(DELIVERER_STATUSES),
  hasActiveRoute: z.boolean(),
  /** Se o app deve compartilhar GPS (disponível ou em rota ativa). */
  sharingLocation: z.boolean(),
  /** Unidades vinculadas ao entregador (com endereço para voltar à loja). */
  stores: z.array(delivererMeStoreSchema).optional(),
});

export type DelivererMeStore = z.infer<typeof delivererMeStoreSchema>;

export type DelivererMe = z.infer<typeof delivererMeSchema>;
export type DelivererPosition = z.infer<typeof delivererPositionSchema>;
export type DelivererPositionsResponse = z.infer<typeof delivererPositionsResponseSchema>;

/** Posição ao vivo se vista nos últimos 90s (margem para intervalo em background). */
export const DELIVERER_POSITION_LIVE_MS = 90_000;

/** Posição considerada desatualizada após este intervalo (ms). */
export const DELIVERER_POSITION_STALE_MS = 5 * 60 * 1000;

export const geocodeAddressQuerySchema = z.object({
  street: z.string().min(1),
  number: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zipCode: z.string().optional(),
});

export const geocodeResultSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  displayName: z.string().optional(),
});

export const delivererSuggestQuerySchema = z.object({
  storeId: z.string().min(1),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  deliveryStreet: z.string().optional(),
  deliveryNumber: z.string().optional(),
  deliveryNeighborhood: z.string().optional(),
  deliveryCity: z.string().optional(),
  deliveryState: z.string().optional(),
});

export const delivererSuggestionSchema = z.object({
  delivererId: z.string(),
  name: z.string(),
  status: z.enum(DELIVERER_STATUSES),
  distanceMeters: z.number().nullable(),
  lastSeenAt: z.string().nullable(),
  stale: z.boolean(),
  assignable: z.boolean(),
  assignableReason: z.string().nullable(),
});

export const delivererSuggestResponseSchema = z.object({
  destination: geocodeResultSchema.nullable(),
  suggestions: z.array(delivererSuggestionSchema),
});

export type GeocodeAddressQuery = z.infer<typeof geocodeAddressQuerySchema>;
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
export type DelivererSuggestion = z.infer<typeof delivererSuggestionSchema>;
export type DelivererSuggestResponse = z.infer<typeof delivererSuggestResponseSchema>;
