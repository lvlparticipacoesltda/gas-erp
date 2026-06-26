export const MOBILE_APPROVAL_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'APPROVED',
  'REJECTED',
] as const;

export type MobileApprovalStatus = (typeof MOBILE_APPROVAL_STATUSES)[number];

export const MOBILE_APPROVAL_LABELS: Record<MobileApprovalStatus, string> = {
  NOT_REQUIRED: 'Não aplicável',
  PENDING: 'Aguardando aprovação (app)',
  APPROVED: 'Aprovada (app)',
  REJECTED: 'Rejeitada (app)',
};

/** Vendas mobile que entram em relatórios e faturamento. */
export const COUNTED_MOBILE_APPROVALS: MobileApprovalStatus[] = [
  'NOT_REQUIRED',
  'APPROVED',
];

export function isSaleCountedForMobileApproval(mobileApproval: string): boolean {
  return COUNTED_MOBILE_APPROVALS.includes(mobileApproval as MobileApprovalStatus);
}
