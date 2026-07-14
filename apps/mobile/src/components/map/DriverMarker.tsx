import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

export type DriverMarkerVariant = 'bicycle' | 'navigation';

/**
 * Marcador do entregador.
 * - `bicycle`: bolha laranja com bicicleta (fora de rota).
 * - `navigation`: seta de navegação apontando para cima (rotação pelo heading
 *   é aplicada pelo Marker no DriverMap).
 */
export function DriverMarker({ variant = 'bicycle' }: { variant?: DriverMarkerVariant }) {
  if (variant === 'navigation') {
    return (
      <View style={styles.navWrap} collapsable={false}>
        <Ionicons name="navigate" size={22} color="#FFFFFF" style={styles.navIcon} />
      </View>
    );
  }

  return (
    <View style={styles.wrap} collapsable={false}>
      <Ionicons name="bicycle" size={26} color={colors.primary} />
    </View>
  );
}

export function useDriverMarkerTracksViewChanges(
  latitude: number,
  longitude: number,
  heading: number | null,
) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(
      () => setTracksViewChanges(false),
      Platform.OS === 'android' ? 1500 : 800,
    );
    return () => clearTimeout(timer);
  }, [latitude, longitude, heading]);

  return tracksViewChanges;
}

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 6,
  },
  navWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A73E8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  // O ícone `navigate` do Ionicons aponta para o canto superior direito (~45°);
  // rotaciona -45° para apontar exatamente para cima (direção do movimento).
  navIcon: { transform: [{ rotate: '-45deg' }] },
});
