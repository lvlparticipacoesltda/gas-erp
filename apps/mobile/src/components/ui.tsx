import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { SaleDisplayTone } from '@gas-erp/shared';
import { makeStyles, radius, spacing, useColors, type Colors } from '../theme';

/** Mapas de cor viram função da paleta: em escopo de módulo ficariam presos ao tema claro. */
function toneStyles(colors: Colors): Record<SaleDisplayTone, { bg: string; fg: string }> {
  return {
    default: { bg: colors.infoBg, fg: colors.infoText },
    success: { bg: colors.successBg, fg: colors.successText },
    warning: { bg: colors.warningBg, fg: colors.warningText },
    danger: { bg: colors.dangerBg, fg: colors.dangerText },
  };
}

export function Badge({ label, tone = 'default' }: { label: string; tone?: SaleDisplayTone }) {
  const styles = useStyles();
  const colors = useColors();
  const s = toneStyles(colors)[tone];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const styles = useStyles();
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, style, pressed && styles.cardPressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const v = buttonVariants(colors)[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.buttonContent}>
          {icon}
          <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

function buttonVariants(
  colors: Colors,
): Record<ButtonVariant, { bg: string; fg: string; border: string }> {
  return {
    primary: { bg: colors.primary, fg: colors.primaryText, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    success: { bg: colors.success, fg: colors.successOn, border: colors.success },
    danger: { bg: colors.surface, fg: colors.dangerText, border: colors.dangerBg },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: 'transparent' },
  };
}

export function StateMessage({
  title,
  subtitle,
  emoji,
  children,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  children?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      {emoji ? <Text style={styles.stateEmoji}>{emoji}</Text> : null}
      <Text style={styles.stateTitle}>{title}</Text>
      {subtitle ? <Text style={styles.stateSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.state}>
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? <Text style={styles.stateSubtitle}>{label}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardPressed: { opacity: 0.85 },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonText: { fontSize: 15, fontWeight: '700' },
  state: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  stateEmoji: { fontSize: 40 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  stateSubtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
}));
