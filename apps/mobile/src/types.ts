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
  product: { id: string; name: string };
}

export interface SaleCustomer {
  id: string;
  name: string;
  phone?: string | null;
}

export interface Sale {
  id: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  total?: number | string | null;
  customer?: SaleCustomer | null;
  items: SaleItem[];
  deliveryStreet?: string | null;
  deliveryNumber?: string | null;
  deliveryComplement?: string | null;
  deliveryNeighborhood?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryLandmark?: string | null;
  payments?: { method: string; amount: number | string }[];
}

export interface TrackingPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  recordedAt: string;
}

export interface Delivery {
  id: string;
  status: DeliveryStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  deliveryAddress?: string | null;
  waitTimeSeconds?: number | null;
  elapsedWaitingSeconds?: number;
  sale: Sale;
  trackingPoints?: TrackingPoint[];
}
