import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatPhoneBr } from '@gas-erp/shared';
import { openWhatsApp } from '@/lib/navigation';
import { makeStyles, radius, spacing, useColors } from '@/theme';

export function CustomerPhoneLink({ phone }: { phone?: string | null }) {
  const styles = useStyles();
  const colors = useColors();
  const formatted = formatPhoneBr(phone);
  if (!formatted.trim() || !phone?.trim()) return null;

  return (
    <Pressable
      onPress={() => openWhatsApp(phone)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityLabel={`Abrir WhatsApp com ${formatted}`}
      accessibilityRole="button"
    >
      <Ionicons name="logo-whatsapp" size={16} color={colors.primary} />
      <Text style={styles.label}>WhatsApp</Text>
      <Text style={styles.phone}>{formatted}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
