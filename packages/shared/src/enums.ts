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

export const PAYMENT_FEE_MODES = ['NONE', 'PERCENT', 'FIXED', 'PERCENT_AND_FIXED'] as const;

export const SALE_CHANNELS = ['PHONE', 'WHATSAPP', 'APP', 'IN_STORE'] as const;

export const FULFILLMENT_TYPES = ['PICKUP', 'DELIVERY'] as const;

export const DELIVERY_STATUSES = ['PENDING', 'IN_PROGRESS', 'DELIVERED', 'CANCELLED'] as const;

export const DELIVERER_STATUSES = ['AVAILABLE', 'ON_DELIVERY', 'OFFLINE'] as const;

export const STOCK_TRANSFER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;

export const SUPPLIER_TYPES = ['PJ', 'PF'] as const;

export const PURCHASE_INVOICE_STATUSES = ['DRAFT', 'CONFIRMED', 'CANCELLED'] as const;

/**
 * Categorias de pagamento da nota de compra.
 *
 * MÓDULO FINANCEIRO ADIADO: por ora isto é uma lista simples/constante. O valor
 * escolhido é gravado como string em `PurchaseInvoicePayment.category`. Quando o
 * módulo Financeiro existir, esta constante deve dar lugar a uma FK
 * (`categoryId`) para a tabela de categorias/subcategorias financeiras.
 */
export const PURCHASE_PAYMENT_CATEGORIES = [
  'Despesas com Fornecedores',
  'Despesas Operacionais',
  'Impostos e Taxas',
  'Outras Despesas',
] as const;

export const DEFAULT_PURCHASE_PAYMENT_CATEGORY = 'Despesas com Fornecedores';

/**
 * Categorias canônicas de cliente (tipo de botijão preferido).
 * Persistidas em `CustomerCategory.name` (únicas por organização).
 */
export const CUSTOMER_CATEGORY_NAMES = ['P13', 'P20', 'P45', 'Gás do Povo'] as const;
export type CustomerCategoryName = (typeof CUSTOMER_CATEGORY_NAMES)[number];

export const CUSTOMER_CATEGORY_LABELS: Record<CustomerCategoryName, string> = {
  P13: 'P13',
  P20: 'P20',
  P45: 'P45',
  'Gás do Povo': 'Gás do Povo',
};

/** Query `categoryId=none` → clientes sem categoria (para categorização manual). */
export const CUSTOMER_CATEGORY_FILTER_NONE = 'none';

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

export const PAYMENT_FEE_MODE_LABELS: Record<string, string> = {
  NONE: 'Sem taxa',
  PERCENT: 'Percentual',
  FIXED: 'Valor fixo',
  PERCENT_AND_FIXED: 'Percentual + fixo',
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
  OFFLINE: 'Indisponível',
};

export const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  PJ: 'Pessoa jurídica',
  PF: 'Pessoa física',
};

export const PURCHASE_INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
};

export const STOCK_TRANSFER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  COMPLETED: 'Concluída',
};

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Pago',
  CANCELLED: 'Cancelado',
};

/** Formas de pagamento sugeridas para gastos da empresa (texto livre é aceito). */
export const EXPENSE_PAYMENT_LABELS = [
  'PIX',
  'Boleto',
  'Cartão',
  'Débito',
  'Dinheiro',
  'Transferência',
  'Débito automático',
  'DAS',
  'Cheque',
] as const;

/**
 * Categorias semeadas em toda organização que ainda não tem nenhuma.
 * `icon` é o nome do ícone `lucide-react`; `color` alimenta o badge e o gráfico de rosca.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Aluguel', icon: 'building-2', color: '#f97316' },
  { name: 'Água', icon: 'droplets', color: '#0ea5e9' },
  { name: 'Luz', icon: 'zap', color: '#eab308' },
  { name: 'Internet e telefone', icon: 'wifi', color: '#8b5cf6' },
  { name: 'Folha de pagamento', icon: 'users', color: '#3b82f6' },
  { name: 'Benefícios', icon: 'ticket', color: '#06b6d4' },
  { name: 'Impostos e taxas', icon: 'landmark', color: '#ef4444' },
  { name: 'Manutenção de veículos', icon: 'wrench', color: '#64748b' },
  { name: 'Combustível', icon: 'fuel', color: '#dc2626' },
  { name: 'Contabilidade', icon: 'calculator', color: '#14b8a6' },
  { name: 'Marketing', icon: 'megaphone', color: '#ec4899' },
  { name: 'Outros', icon: 'circle-ellipsis', color: '#94a3b8' },
] as const;

/** Cor de fallback para categoria sem cor definida. */
export const EXPENSE_CATEGORY_FALLBACK_COLOR = '#94a3b8';

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_ADMIN: 'Admin Plataforma',
  ORG_MASTER: 'Master',
  STORE_MANAGER: 'Gerente de Loja',
  ATTENDANT: 'Atendente',
  FINANCE: 'Financeiro',
  DELIVERER: 'Entregador',
};
