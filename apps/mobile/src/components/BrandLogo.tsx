import { Image, StyleSheet, View } from 'react-native';

/** Logo empilhado (fundo escuro) — exportado do manual da marca. */
export function BrandLogo() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/logo-login.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Gás do Povo Entregador"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  logo: { width: 280, height: 300 },
});
