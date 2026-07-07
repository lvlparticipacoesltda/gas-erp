import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';

/** Marcador do entregador — bicicleta laranja (Ionicons bicycle). */
export function DriverMarker() {
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
});
