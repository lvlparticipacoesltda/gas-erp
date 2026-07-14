import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheet } from '../BottomSheet';
import { DeliveryCard } from '../DeliveryCard';
import { Loading, StateMessage } from '../ui';
import { colors, radius, spacing } from '../../theme';
import type { Delivery } from '../../types';

type Section = { title: string; data: Delivery[] };

export function DeliveryPickerSheet({
  visible,
  inProgress,
  pending,
  activeId,
  loading,
  refreshing,
  error,
  onRefresh,
  onClose,
  onSelect,
}: {
  visible: boolean;
  inProgress: Delivery[];
  pending: Delivery[];
  activeId?: string | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh: () => void;
  onClose: () => void;
  onSelect: (delivery: Delivery) => void;
}) {
  const insets = useSafeAreaInsets();

  const sections: Section[] = [];
  if (inProgress.length > 0) {
    sections.push({ title: 'Em rota', data: inProgress });
  }
  if (pending.length > 0) {
    sections.push({ title: 'Aguardando', data: pending });
  }

  const total = inProgress.length + pending.length;

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightRatio={0.72}>
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>
            {total > 0 ? `Entregas (${total})` : 'Entregas'}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <Loading label="Carregando entregas..." />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
            renderSectionHeader={({ section }) => (
              <Text style={styles.sectionTitle}>{section.title}</Text>
            )}
            renderItem={({ item }) => (
              <DeliveryCard
                delivery={item}
                highlighted={item.id === activeId}
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
                  title="Nenhuma entrega pendente"
                  subtitle="Você está em dia. Puxe para atualizar."
                />
              )
            }
          />
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.lg },
});
