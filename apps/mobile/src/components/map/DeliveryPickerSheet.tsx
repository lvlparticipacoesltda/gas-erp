import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeliveryCard } from '../DeliveryCard';
import { Loading, StateMessage } from '../ui';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';

export function DeliveryPickerSheet({
  visible,
  pending,
  loading,
  refreshing,
  error,
  onRefresh,
  onClose,
  onSelect,
}: {
  visible: boolean;
  pending: Delivery[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onSelect: (delivery: Delivery) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Entregas aguardando</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <Loading label="Carregando entregas..." />
        ) : (
          <FlatList
            data={pending}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            renderItem={({ item }) => (
              <DeliveryCard
                delivery={item}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              />
            )}
            ListEmptyComponent={
              error ? (
                <StateMessage emoji="⚠️" title="Não foi possível carregar" subtitle={error} />
              ) : (
                <StateMessage
                  emoji="✅"
                  title="Nenhuma entrega aguardando"
                  subtitle="Você está em dia. Puxe para atualizar."
                />
              )
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 20, 12, 0.35)',
  },
  sheet: {
    maxHeight: '72%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg },
});
