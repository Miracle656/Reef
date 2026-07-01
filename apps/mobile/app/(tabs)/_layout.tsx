import { View } from 'react-native';
import { withLayoutContext } from 'expo-router';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import type { ParamListBase, TabNavigationState } from '@react-navigation/native';
import type { MaterialTopTabNavigationEventMap, MaterialTopTabNavigationOptions } from '@react-navigation/material-top-tabs';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { Navigator } = createMaterialTopTabNavigator();

// Native swipeable pager (react-native-pager-view) with our own tab UI —
// the floating pill lives in the root layout, so the native tab bar is hidden here.
const Tabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const t      = Colors[scheme ?? 'light'];

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: t.background }}>
      <Tabs tabBar={() => null} screenOptions={{ swipeEnabled: true }}>
        <Tabs.Screen name="index"    options={{ title: 'Home'    }} />
        <Tabs.Screen name="search"   options={{ title: 'Search'  }} />
        <Tabs.Screen name="messages" options={{ title: 'Inbox'   }} />
        <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
      </Tabs>
    </View>
  );
}
