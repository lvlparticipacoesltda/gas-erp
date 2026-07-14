import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type CheckpointVariant = 'preview' | 'active';

const VARIANTS: Record<CheckpointVariant, { fill: string; ring: string }> = {
  preview: { fill: '#4285F4', ring: '#FFFFFF' },
  active: { fill: '#EA4335', ring: '#FFFFFF' },
};

/** Pin de chegada no final da rota — estilo checkpoint do Google Maps. */
export function RouteCheckpointMarker({
  variant = 'active',
}: {
  variant?: CheckpointVariant;
}) {
  const colors = VARIANTS[variant];

  return (
    <View style={styles.wrap} collapsable={false}>
      <View style={[styles.head, { backgroundColor: colors.fill, borderColor: colors.ring }]}>
        <Ionicons name="flag" size={16} color="#FFFFFF" />
      </View>
      <View style={[styles.stem, { backgroundColor: colors.fill }]} />
      <View style={[styles.dot, { backgroundColor: colors.fill, borderColor: colors.ring }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: 36,
    height: 48,
  },
  head: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  stem: {
    width: 3,
    height: 8,
    marginTop: -1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    marginTop: -1,
  },
});
