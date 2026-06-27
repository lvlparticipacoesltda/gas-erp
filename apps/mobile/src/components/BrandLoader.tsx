import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

const ICON = require('../../assets/icon.png');

export function BrandLoader({
  label,
  size = 72,
  showLabel = true,
}: {
  label?: string;
  size?: number;
  showLabel?: boolean;
}) {
  const fill = useRef(new Animated.Value(0.28)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const easing = Easing.bezier(0.45, 0.05, 0.25, 1);
    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fill, { toValue: 1, duration: 800, easing, useNativeDriver: true }),
          Animated.timing(fill, { toValue: 0.28, duration: 800, easing, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.02, duration: 800, easing, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 800, easing, useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathe, fill]);

  const half = size / 2;

  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Carregando'}>
      <Animated.View style={[styles.shell, { transform: [{ scale: breathe }] }]}>
        <Image source={ICON} style={[styles.icon, { width: size, height: size, opacity: 0.14 }]} />
        <View style={[styles.mask, { width: size, height: size }]}>
          <Animated.View
            style={{
              width: size,
              height: size,
              transform: [
                { translateY: half },
                { scaleY: fill },
                { translateY: -half },
              ],
            }}
          >
            <Image source={ICON} style={{ width: size, height: size }} resizeMode="contain" />
          </Animated.View>
        </View>
      </Animated.View>
      {showLabel && label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  shell: {
    position: 'relative',
  },
  icon: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  mask: {
    overflow: 'hidden',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
