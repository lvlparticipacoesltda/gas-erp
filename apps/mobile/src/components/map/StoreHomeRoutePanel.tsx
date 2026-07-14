import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

/** Painel inferior enquanto a navegação nativa até a base está ativa. */
export function StoreHomeRoutePanel({
  storeName,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
  onOpenGoogleMaps,
  onOpenWaze,
}: {
  storeName: string;
  etaLabel: string | null;
  distanceLabel: string | null;
  routeLoading: boolean;
  routeError: string | null;
  onOpenGoogleMaps: () => void;
  onOpenWaze: () => void;
}) {
  const statusText = routeLoading
    ? 'Calculando rota…'
    : routeError
      ? routeError
      : [etaLabel, distanceLabel].filter(Boolean).join(' · ') || 'Navegando até a unidade';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <Ionicons name="home" size={20} color="#FFF" />
          </View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>Rota até a base</Text>
            <Text style={styles.title} numberOfLines={1}>
              {storeName}
            </Text>
          </View>
        </View>

        <Text
          style={routeError && !routeLoading ? styles.error : styles.meta}
          numberOfLines={2}
        >
          {statusText}
        </Text>

        <View style={styles.navRow}>
          <Pressable
            style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
            onPress={onOpenGoogleMaps}
            accessibilityLabel="Abrir no Google Maps"
          >
            <Ionicons name="navigate-outline" size={16} color="#FFF" />
            <Text style={styles.navLabel}>Maps</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.navBtn, pressed && styles.navBtnPressed]}
            onPress={onOpenWaze}
            accessibilityLabel="Abrir no Waze"
          >
            <Ionicons name="car-outline" size={16} color="#FFF" />
            <Text style={styles.navLabel}>Waze</Text>
          </Pressable>
        </View>

        <Text style={styles.hint} numberOfLines={1}>
          Toque no botão Home novamente para sair desta rota
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  card: {
    minHeight: 168,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  flex: { flex: 1 },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
  },
  meta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  error: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FEE2E2',
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  navBtnPressed: { opacity: 0.85 },
  navLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
});
