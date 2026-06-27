import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from './enums';
import type { PaymentFeeModeValue } from './schemas/payment-method';

export interface DefaultStorePaymentMethodSeed {
  systemCode: (typeof PAYMENT_METHODS)[number];
  label: string;
  isCustom: false;
  enabled: boolean;
  sortOrder: number;
  feeMode: PaymentFeeModeValue;
  feePercent: number;
  feeFixed: number;
}

/** Catálogo padrão ao criar loja ou migrar dados existentes. */
export function buildDefaultStorePaymentMethods(): DefaultStorePaymentMethodSeed[] {
  return PAYMENT_METHODS.map((code, index) => ({
    systemCode: code,
    label: PAYMENT_METHOD_LABELS[code] ?? code,
    isCustom: false as const,
    enabled: code !== 'GDP',
    sortOrder: index,
    feeMode: 'NONE' as const,
    feePercent: 0,
    feeFixed: 0,
  }));
}
