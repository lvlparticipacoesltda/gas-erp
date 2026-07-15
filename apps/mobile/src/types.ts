import type { DELIVERY_STATUSES } from '@gas-erp/shared';

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  storeIds: string[];
  permissions?: string[];
}

export interface Organization {
  id: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  organization: Organization;
}

export interface SaleItem {
  id: string;
  quantity: number;
  unitPrice?: number | string | null;
  total?: number | string | null;
  storePaymentMethodId?: string | null;
  storePaymentMethod?: { id: string; label: string; systemCode: string | null } | null;
  product: { id: string; name: string };
}

export interface SaleCustomer {
  id: string;
  name: string;
  phone?: string | null;
}

export interface Sale {
  id: string;
  storeId?: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  total?: number | string | null;
  deliveryFee?: number | string | null;
  deliveryFeeStorePaymentMethodId?: string | null;
  customer?: SaleCustomer | null;
  items: SaleItem[];
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
  gasDoPovoBenefit?: boolean;
  payments?: { method: string; amount: number | string; storePaymentMethodId?: string | null }[];
}

export interface TrackingPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt: string;
}

export interface DeliveryDestination {
  latitude: number;
  longitude: number;
}

export interface Delivery {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  deliveryAddress?: string | null;
  destination?: DeliveryDestination | null;
  waitTimeSeconds?: number | null;
  routeDurationSeconds?: number | null;
  elapsedWaitingSeconds?: number;
  elapsedRouteSeconds?: number | null;
  sale: Sale;
  trackingPoints?: TrackingPoint[];
}
