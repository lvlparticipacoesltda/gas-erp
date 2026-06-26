export const USER_ROLES = [
  'PLATFORM_ADMIN',
  'ORG_MASTER',
  'STORE_MANAGER',
  'ATTENDANT',
  'FINANCE',
  'DELIVERER',
] as const;

export const SALE_STATUSES = [
  'DRAFT',
  'CONFIRMED',
  'IN_DELIVERY',
  'DELIVERED',
  'PORTARIA',
  'CANCELLED',
] as const;

export const PAYMENT_METHODS = [
  'CASH',
  'PIX',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'CHECK',
  'CUSTOMER_CREDIT',
  'GDP',
  'OTHER',
] as const;

export const SALE_CHANNELS = ['PHONE', 'WHATSAPP', 'APP', 'IN_STORE'] as const;

export const FULFILLMENT_TYPES = ['PICKUP', 'DELIVERY'] as const;

export const DELIVERY_STATUSES = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED'] as const;

export const DELIVERER_STATUSES = ['AVAILABLE', 'ON_DELIVERY', 'OFFLINE'] as const;

export const STOCK_TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de Crédito',
  DEBIT_CARD: 'Cartão de Débito',
  CHECK: 'Cheque',
  CUSTOMER_CREDIT: 'Crédito de Cliente',
  GDP: 'GDP (Gás do Povo)',
  OTHER: 'Outro',
};

export const SALE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmada',
  IN_DELIVERY: 'Em entrega',
  DELIVERED: 'Entregue',
  PORTARIA: 'Portaria',
  CANCELLED: 'Cancelada',
};

export const SALE_CHANNEL_LABELS: Record<string, string> = {
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  APP: 'App',
  IN_STORE: 'Portaria',
};

export const FULFILLMENT_TYPE_LABELS: Record<string, string> = {
  PICKUP: 'Portaria (retirada)',
  DELIVERY: 'Entrega',
};

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Aguardando',
  IN_PROGRESS: 'Em rota',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
};

export const DELIVERER_STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Disponível',
  ON_DELIVERY: 'Em rota',
  OFFLINE: 'Offline',
};

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Admin Plataforma',
  ORG_MASTER: 'Master',
  STORE_MANAGER: 'Gerente de Loja',
  ATTENDANT: 'Atendente',
  FINANCE: 'Financeiro',
  DELIVERER: 'Entregador',
};
