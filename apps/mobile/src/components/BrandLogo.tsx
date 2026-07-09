import { Image, StyleSheet, View } from 'react-native';
import { APP_DISPLAY_NAME } from '@/constants/branding';

/** Logo empilhado (fundo escuro) — exportado do manual da marca. */
export function BrandLogo() {
  return (
    <View style={styles.wrap}>
      <Image
        source={require('../../assets/logo-login.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel={APP_DISPLAY_NAME}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: '100%' },
  logo: { width: 280, height: 300 },
});
