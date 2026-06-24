export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  storeIds: string[];
  permissions?: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DeliveryTrackingPayload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  recordedAt?: string;
}

export interface FiscalProviderConfig {
  provider: string;
  apiKey?: string;
  environment?: 'sandbox' | 'production';
}

export interface FiscalIssueRequest {
  saleId: string;
  type: 'NFC-e' | 'NF-e';
}

export interface FiscalIssueResult {
  status: 'PENDING' | 'ISSUED' | 'ERROR';
  accessKey?: string;
  message?: string;
}
