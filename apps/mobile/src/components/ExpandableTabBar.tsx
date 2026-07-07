import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';

const TAB_ACTIVE = colors.primary;
const TAB_INACTIVE = colors.textFaint;
const ICON_SIZE = 24;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ExpandableTabBar(props: any) {
  const { state, descriptors, navigation } = props;
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.wrap}>
      <View style={[styles.tabRow, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 8) }]}>
        {state.routes.map((route: { key: string; name: string }, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const color = isFocused ? TAB_ACTIVE : TAB_INACTIVE;

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={styles.tabItem}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
            >
              {options.tabBarIcon?.({ color, size: ICON_SIZE, focused: isFocused })}
              <Text style={[styles.tabLabel, { color }]}>{options.title ?? route.name}</Text>
              {options.tabBarBadge != null ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{String(options.tabBarBadge)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tabRow: {
    flexDirection: 'row',
    paddingTop: 8,
    backgroundColor: colors.surface,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 48,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: '22%',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
});
