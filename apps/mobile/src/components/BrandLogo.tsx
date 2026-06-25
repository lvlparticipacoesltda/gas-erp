import { Image, View, Text, StyleSheet } from 'react-native';

export function BrandLogo() {
  return (
    <View style={styles.wrap}>
      <Image source={require('../../assets/icon.png')} style={styles.icon} resizeMode="contain" />
      <View style={styles.textCenter}>
        <Text style={styles.gas}>gás</Text>
        <Text style={styles.povo}>do povo</Text>
        <Text style={styles.tagline}>Entregador</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12 },
  icon: { width: 88, height: 88, borderRadius: 20 },
  textCenter: { alignItems: 'center' },
  gas: { fontSize: 28, fontWeight: '800', color: '#FFFFFF', textTransform: 'lowercase' },
  povo: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#F4EEE8',
    textTransform: 'uppercase',
    letterSpacing: 3,
  },
  tagline: { marginTop: 6, fontSize: 13, color: '#CBD5E1', fontWeight: '500' },
});
