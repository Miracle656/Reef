import { View, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRef, useCallback } from 'react';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const PILL_H  = 66;
const PILL_MX = 20;

const LEFT_TABS:  { name: string; icon: FeatherName }[] = [
  { name: 'index',   icon: 'home'          },
  { name: 'trade',  icon: 'trending-up'   },
];
const RIGHT_TABS: { name: string; icon: FeatherName }[] = [
  { name: 'messages', icon: 'message-circle' },
  { name: 'profile',  icon: 'user'           },
];

function TabBtn({
  icon, active, accent, dim, onPress,
}: {
  icon: FeatherName; active: boolean; accent: string; dim: string; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.80, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 240, friction: 6 }),
    ]).start();
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable style={styles.tabBtn} onPress={handlePress}>
      <Animated.View style={[styles.tabInner, { transform: [{ scale }] }]}>
        {active && <View style={[styles.activeBlob, { backgroundColor: accent + '1a' }]} />}
        <Feather name={icon} size={22} color={active ? accent : dim} />
        <View style={[styles.dot, { backgroundColor: active ? accent : 'transparent' }]} />
      </Animated.View>
    </Pressable>
  );
}

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const t       = Colors[scheme ?? 'light'];
  const router  = useRouter();
  const isDark  = scheme === 'dark';
  const compAnim = useRef(new Animated.Value(1)).current;

  const onCompose = () => {
    Animated.sequence([
      Animated.timing(compAnim, { toValue: 0.82, duration: 70, useNativeDriver: true }),
      Animated.spring(compAnim, { toValue: 1, useNativeDriver: true, tension: 240, friction: 6 }),
    ]).start();
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/compose');
  };

  const go = useCallback((routeName: string) => {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const focused = state.routes[state.index]?.name === routeName;
    const ev = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !ev.defaultPrevented) navigation.navigate(routeName);
  }, [state, navigation]);

  const activeRouteName = state.routes[state.index]?.name;
  const bottomPad = Math.max(insets.bottom, 8) + 28;
  const pillBg    = isDark ? 'rgba(18,18,24,0.97)' : 'rgba(255,255,255,0.97)';
  const border    = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomPad }]}
    >
      <View style={[styles.pill, { backgroundColor: pillBg, borderColor: border }]}>
        {LEFT_TABS.map((tab) => (
          <TabBtn
            key={tab.name}
            icon={tab.icon}
            active={activeRouteName === tab.name}
            accent={t.accent}
            dim={t.inkFaint}
            onPress={() => go(tab.name)}
          />
        ))}

        {/* Compose — inline with other icons, styled as an accent circle */}
        <Pressable style={styles.tabBtn} onPress={onCompose} accessibilityLabel="New post">
          <Animated.View style={{ transform: [{ scale: compAnim }] }}>
            <View style={[styles.composeCircle, { backgroundColor: t.accent }]}>
              <Feather name="plus" size={22} color="#fff" />
            </View>
          </Animated.View>
        </Pressable>

        {RIGHT_TABS.map((tab) => (
          <TabBtn
            key={tab.name}
            icon={tab.icon}
            active={activeRouteName === tab.name}
            accent={t.accent}
            dim={t.inkFaint}
            onPress={() => go(tab.name)}
          />
        ))}
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Home'    }} />
      <Tabs.Screen name="trade"    options={{ title: 'Trade'   }} />
      <Tabs.Screen name="compose"  options={{ title: 'Compose' }} />
      <Tabs.Screen name="messages" options={{ title: 'Inbox'   }} />
      <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: PILL_MX,
  },
  pill: {
    height: PILL_H,
    borderRadius: PILL_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    shadowColor: '#09091a',
    shadowOffset:  { width: 0, height: 10 },
    shadowOpacity: 0.13,
    shadowRadius:  28,
    elevation:     14,
  },
  tabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activeBlob: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  composeCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0a84ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
