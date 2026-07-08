import { View, Text, Pressable, StyleSheet, Animated, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Avatar } from '@/components/ui';
import { MOCK_AUTHORS } from '@/lib/mock';
import { useMessaging } from '@/lib/messaging/provider';
import { useUnreadNotifications } from '@/lib/notifications';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const PILL_H  = 60;
const PILL_MX = 20;

// Full-screen routes that own their own chrome — the pill hides there.
const HIDDEN_PREFIXES = ['/onboarding'];

type Tab = { href: string; icon: FeatherName; label: string; match: (p: string) => boolean; badge?: number };

function TabBtn({
  icon, label, active, badge, ink, onInk, inkSoft, onPress,
}: {
  icon: FeatherName; label: string; active: boolean; badge?: number;
  ink: string; onInk: string; inkSoft: string; onPress: () => void;
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
    <Pressable style={styles.tabBtn} onPress={handlePress} accessibilityLabel={label} hitSlop={6}>
      <Animated.View style={[styles.tabInner, active && { backgroundColor: ink }, { transform: [{ scale }] }]}>
        <Feather name={icon} size={21} color={color} />
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
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
  const [menuOpen, setMenuOpen] = useState(false);

  const { state } = useMessaging();
  const unreadMessages = state.chats.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
  const unreadNotifs = useUnreadNotifications();
  const me = MOCK_AUTHORS['lagosbuild']!;

  // Hide on full-screen detail routes that own their own bottom bar (chat thread, onboarding).
  const onChatThread = pathname.startsWith('/messages/');
  const visible = !onChatThread && !HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (!visible) return null;

  const onCompose = () => {
    Animated.sequence([
      Animated.timing(compAnim, { toValue: 0.82, duration: 70, useNativeDriver: true }),
      Animated.spring(compAnim, { toValue: 1, useNativeDriver: true, tension: 240, friction: 6 }),
    ]).start();
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/compose');
  };

  const LEFT_TABS: Tab[] = [
    { href: '/',       icon: 'home',        label: 'Home',   match: (p) => p === '/' },
    { href: '/search', icon: 'search',      label: 'Search', match: (p) => p.startsWith('/search') },
    { href: '/trade',  icon: 'bar-chart-2', label: 'Trade',  match: (p) => p.startsWith('/trade') },
  ];
  const RIGHT_TABS: Tab[] = [
    { href: '/notifications', icon: 'bell',            label: 'Notifications', match: (p) => p.startsWith('/notifications'), badge: unreadNotifs },
    { href: '/messages',      icon: 'message-circle',  label: 'Messages',      match: (p) => p.startsWith('/messages'),      badge: unreadMessages },
  ];

  const meActive = pathname.startsWith('/profile') || pathname.startsWith('/settings');
  const bottomPad = Math.max(insets.bottom, 8) + 28;
  const tint      = isDark ? 'rgba(18,18,24,0.55)' : 'rgba(255,255,255,0.55)';
  const border    = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';

  const goTo = (href: string) => {
    setMenuOpen(false);
    router.navigate(href as never);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingBottom: bottomPad }]}
    >
      {menuOpen ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
      ) : null}

      {menuOpen ? (
        <View style={[styles.menu, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Pressable style={styles.menuRow} onPress={() => goTo('/profile')}>
            <Feather name="user" size={18} color={t.ink} />
            <Text style={[styles.menuLabel, { color: t.ink }]}>Profile</Text>
          </Pressable>
          <Pressable style={styles.menuRow} onPress={() => goTo('/settings')}>
            <Feather name="settings" size={18} color={t.ink} />
            <Text style={[styles.menuLabel, { color: t.ink }]}>Settings</Text>
          </Pressable>
        </View>
      ) : null}

      <BlurView intensity={70} tint={isDark ? 'dark' : 'light'} style={[styles.pill, { borderColor: border, overflow: 'hidden' }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
        {LEFT_TABS.map((tab) => (
          <TabBtn
            key={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={tab.match(pathname)}
            badge={tab.badge}
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
              <Feather name="plus" size={20} color="#fff" />
            </View>
          </Animated.View>
        </Pressable>

        {RIGHT_TABS.map((tab) => (
          <TabBtn
            key={tab.href}
            icon={tab.icon}
            label={tab.label}
            active={tab.match(pathname)}
            badge={tab.badge}
            ink={t.ink}
            onInk={t.onInk}
            inkSoft={t.inkSoft}
            onPress={() => router.navigate(tab.href as never)}
          />
        ))}

        {/* me: profile + settings, folded behind the avatar (matches web) */}
        <Pressable
          style={styles.tabBtn}
          onPress={() => setMenuOpen((v) => !v)}
          accessibilityLabel="Profile and settings"
        >
          <View style={[styles.avatarWrap, meActive && { backgroundColor: t.ink }]}>
            <Avatar name={me.displayName} src={me.avatar} size={26} />
          </View>
        </Pressable>
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
    justifyContent: 'space-between',
    borderWidth: 1.5,
    paddingHorizontal: 8,
    shadowColor: '#09091a',
    shadowOffset:  { width: 0, height: 10 },
    shadowOpacity: 0.13,
    shadowRadius:  28,
    elevation:     14,
  },
  tabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 9,
    borderRadius: 999,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#0a84ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 11,
  },
  composeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0a84ff',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    right: PILL_MX,
    bottom: PILL_H + 24,
    width: 176,
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
    shadowColor: '#09091a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 16,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  menuLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
