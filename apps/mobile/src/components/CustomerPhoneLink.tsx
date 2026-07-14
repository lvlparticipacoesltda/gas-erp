import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPhoneBr } from '@gas-erp/shared';
import { callPhone } from '@/lib/navigation';
import { colors, radius, spacing } from '@/theme';

export function CustomerPhoneLink({ phone }: { phone?: string | null }) {
  const formatted = formatPhoneBr(phone);
  if (!formatted.trim() || !phone?.trim()) return null;

  return (
    <Pressable
      onPress={() => callPhone(phone)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityLabel={`Ligar para ${formatted}`}
      accessibilityRole="button"
    >
      <Ionicons name="call-outline" size={16} color={colors.primary} />
      <Text style={styles.label}>Ligar</Text>
      <Text style={styles.phone}>{formatted}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.infoBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  label: { fontSize: 14, fontWeight: '700', color: colors.primary },
  phone: { fontSize: 14, fontWeight: '600', color: colors.text },
});
