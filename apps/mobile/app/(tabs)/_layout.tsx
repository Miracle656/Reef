import { Pressable, View, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

function HomeIcon({ color }: { color: string }) {
  return (
    <Text style={{ color, fontSize: 20 }}>🏠</Text>
  );
}
function TradeIcon({ color }: { color: string }) {
  return (
    <Text style={{ color, fontSize: 20 }}>📈</Text>
  );
}
function MessagesIcon({ color }: { color: string }) {
  return (
    <Text style={{ color, fontSize: 20 }}>✉️</Text>
  );
}
function ProfileIcon({ color }: { color: string }) {
  return (
    <Text style={{ color, fontSize: 20 }}>👤</Text>
  );
}

function ComposeTabButton() {
  const router = useRouter();
  const scheme = useColorScheme();
  const t = Colors[scheme ?? 'light'];
  return (
    <Pressable
      onPress={() => router.push('/compose')}
      style={({ pressed }) => [styles.composePressable, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel="New post"
    >
      <View style={[styles.composeCircle, { backgroundColor: t.accent }]}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 }}>+</Text>
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const scheme = useColorScheme();
  const t = Colors[scheme ?? 'light'];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.tint,
        tabBarInactiveTintColor: t.tabIconDefault,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="trade"
        options={{
          title: 'Trade',
          tabBarIcon: ({ color }) => <TradeIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="compose"
        options={{
          title: '',
          tabBarButton: () => <ComposeTabButton />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color }) => <MessagesIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  composePressable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
});
