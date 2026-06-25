/** Paleta e tokens de design do app do entregador. */
export const colors = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceAlt: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  primary: '#F97316',
  primaryDark: '#EA580C',
  primaryText: '#FFFFFF',
  navy: '#0F172A',
  success: '#16A34A',
  successBg: '#DCFCE7',
  successText: '#166534',
  warning: '#D97706',
  warningBg: '#FFEDD5',
  warningText: '#9A3412',
  danger: '#DC2626',
  dangerBg: '#FEE2E2',
  dangerText: '#991B1B',
  info: '#0284C7',
  infoBg: '#E0F2FE',
  infoText: '#075985',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
