import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRef } from 'react';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const PILL_H  = 66;
const PILL_MX = 20;

// Routes where the floating pill is shown at all (matches the old nested-in-tabs behavior).
const VISIBLE_PREFIXES = ['/search', '/messages', '/profile', '/trade'];

type Tab = { href: string; icon: FeatherName; label: string; match: (p: string) => boolean };

const LEFT_TABS: Tab[] = [
  { href: '/',       icon: 'home',   label: 'Home',   match: (p) => p === '/' },
  { href: '/search', icon: 'search', label: 'Search', match: (p) => p.startsWith('/search') },
];
const RIGHT_TABS: Tab[] = [
  { href: '/messages', icon: 'message-circle', label: 'Messages', match: (p) => p.startsWith('/messages') },
  { href: '/profile',  icon: 'user',           label: 'Profile',  match: (p) => p.startsWith('/profile')  },
];

function TabBtn({
  icon, label, active, ink, onInk, inkSoft, onPress,
}: {
  icon: FeatherName; label: string; active: boolean; ink: string; onInk: string; inkSoft: string; onPress: () => void;
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

  const color = active ? onInk : inkSoft;

  return (
    <Pressable style={styles.tabBtn} onPress={handlePress}>
      <Animated.View style={[styles.tabInner, active && { backgroundColor: ink }, { transform: [{ scale }] }]}>
        <Feather name={icon} size={22} color={color} />
        <Text style={[styles.tabLabel, { color }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function FloatingTabBar() {
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const t        = Colors[scheme ?? 'light'];
  const router   = useRouter();
  const pathname = usePathname();
  const isDark   = scheme === 'dark';
  const compAnim = useRef(new Animated.Value(1)).current;

  const visible = pathname === '/' || VISIBLE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!visible) return null;

  const onCompose = () => {
    Animated.sequence([
      Animated.timing(compAnim, { toValue: 0.82, duration: 70, useNativeDriver: true }),
      Animated.spring(compAnim, { toValue: 1, useNativeDriver: true, tension: 240, friction: 6 }),
    ]).start();
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/compose');
  };

  const bottomPad = Math.max(insets.bottom, 8) + 28;
  const tint      = isDark ? 'rgba(18,18,24,0.55)' : 'rgba(255,255,255,0.55)';
  const border    = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomPad }]}
    >
      <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={[styles.pill, { borderColor: border, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
        {LEFT_TABS.map((tab) => (
          <TabBtn
            key={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={tab.match(pathname)}
            ink={t.ink}
            onInk={t.onInk}
            inkSoft={t.inkSoft}
            onPress={() => router.navigate(tab.href as never)}
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
            key={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={tab.match(pathname)}
            ink={t.ink}
            onInk={t.onInk}
            inkSoft={t.inkSoft}
            onPress={() => router.navigate(tab.href as never)}
          />
        ))}
      </BlurView>
    </View>
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
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
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
