import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';

/** Observação da venda para o entregador (telefone, endereço, etc.). */
export function DeliveryNotes({
  notes,
  numberOfLines,
}: {
  notes?: string | null;
  numberOfLines?: number;
}) {
  const text = notes?.trim();
  if (!text) return null;

  return (
    <View style={styles.wrap}>
      <Ionicons name="document-text-outline" size={16} color={colors.warningText} />
      <View style={styles.body}>
        <Text style={styles.label}>Observação</Text>
        <Text style={styles.text} numberOfLines={numberOfLines}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  body: { flex: 1, gap: 2 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.warningText,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 20,
  },
});
