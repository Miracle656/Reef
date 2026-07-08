import { View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useTopInset() {
  return useSafeAreaInsets().top;
}

export function Screen({ style, ...rest }: ViewProps) {
  const top = useTopInset();
  return <View style={[{ flex: 1, paddingTop: top }, style]} {...rest} />;
}
