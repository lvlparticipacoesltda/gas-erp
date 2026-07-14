import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';

/** Painel inferior enquanto a navegação nativa até a base está ativa. */
export function StoreHomeRoutePanel({
  storeName,
  etaLabel,
  distanceLabel,
  routeLoading,
  routeError,
}: {
  storeName: string;
  etaLabel: string | null;
  distanceLabel: string | null;
  routeLoading: boolean;
  routeError: string | null;
}) {
  return (
    <View style={[styles.wrap, { paddingBottom: spacing.md }]}>
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

        {routeLoading ? (
          <Text style={styles.meta}>Calculando rota…</Text>
        ) : routeError ? (
          <Text style={styles.error}>{routeError}</Text>
        ) : (
          <Text style={styles.meta}>
            {[etaLabel, distanceLabel].filter(Boolean).join(' · ') || 'Navegando até a unidade'}
          </Text>
        )}

        <Text style={styles.hint}>Toque no botão Home novamente para sair desta rota</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
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
    marginTop: spacing.xs,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 13,
    fontWeight: '600',
    color: '#FEE2E2',
  },
  hint: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
});
