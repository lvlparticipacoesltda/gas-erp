import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NextManeuver } from '../../hooks/useRouteNavigation';
import { radius, spacing } from '../../theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

const MANEUVER_ICONS: Record<string, IoniconName> = {
  'turn-right': 'arrow-forward',
  'turn-left': 'arrow-back',
  'turn-slight-right': 'return-up-forward',
  'turn-slight-left': 'return-up-back',
  'turn-sharp-right': 'arrow-redo',
  'turn-sharp-left': 'arrow-undo',
  'uturn-right': 'arrow-undo',
  'uturn-left': 'arrow-undo',
  'ramp-right': 'return-up-forward',
  'ramp-left': 'return-up-back',
  'fork-right': 'return-up-forward',
  'fork-left': 'return-up-back',
  'keep-right': 'return-up-forward',
  'keep-left': 'return-up-back',
  merge: 'git-merge',
  'roundabout-right': 'sync',
  'roundabout-left': 'sync',
  straight: 'arrow-up',
};

function iconForManeuver(maneuver?: string): IoniconName {
  if (!maneuver) return 'arrow-up';
  return MANEUVER_ICONS[maneuver] ?? 'navigate';
}

export function ManeuverBanner({
  maneuver,
  topInset,
}: {
  maneuver: NextManeuver;
  topInset: number;
}) {
  return (
    <View style={[styles.banner, { top: topInset }]} pointerEvents="none">
      <View style={styles.iconWrap}>
        <Ionicons name={iconForManeuver(maneuver.maneuver)} size={26} color="#FFFFFF" />
      </View>
      <View style={styles.flex}>
        <Text style={styles.distance}>{maneuver.distanceLabel}</Text>
        <Text style={styles.instruction} numberOfLines={2}>
          {maneuver.instruction}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: '#1A73E8',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  flex: { flex: 1 },
  distance: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  instruction: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.92)', marginTop: 2 },
});
