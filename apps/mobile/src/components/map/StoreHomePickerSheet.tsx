import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DelivererMeStore } from '@gas-erp/shared';
import { BottomSheet } from '../BottomSheet';
import { colors, radius, spacing } from '../../theme';
import { buildStoreAddress } from '../../lib/store-home';

export function StoreHomePickerSheet({
  visible,
  stores,
  onClose,
  onSelect,
}: {
  visible: boolean;
  stores: DelivererMeStore[];
  onClose: () => void;
  onSelect: (store: DelivererMeStore) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.55}>
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Voltar à loja</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Escolha a unidade para traçar a rota no app:</Text>
        <View style={styles.list}>
          {stores.map((store) => {
            const address = buildStoreAddress(store);
            return (
              <Pressable
                key={store.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onSelect(store)}
                accessibilityLabel={`Navegar até ${store.name}`}
              >
                <View style={styles.iconWrap}>
                  <Ionicons name="home-outline" size={20} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{store.name}</Text>
                  <Text style={styles.address} numberOfLines={2}>
                    {address || 'Endereço não cadastrado'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { opacity: 0.85 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoBg,
  },
  flex: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  address: { marginTop: 2, fontSize: 12, color: colors.textMuted },
});
