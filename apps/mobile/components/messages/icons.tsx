/**
 * Message icons — RN port of the web `icons.tsx` inline SVGs, backed by
 * @expo/vector-icons Feather (no react-native-svg dependency). Same names as web
 * so ported components read the same.
 */
import Feather from '@expo/vector-icons/Feather';
import { View } from 'react-native';

type IconProps = { size?: number; color?: string };

const mk = (name: React.ComponentProps<typeof Feather>['name']) =>
  function Icon({ size = 20, color = 'currentColor' }: IconProps) {
    return <Feather name={name} size={size} color={color === 'currentColor' ? undefined : color} />;
  };

export const SendIcon = mk('send');
export const SearchIcon = mk('search');
export const PlusIcon = mk('plus');
export const BackIcon = mk('arrow-left');
export const CheckIcon = mk('check');
export const ImageIcon = mk('image');
export const PaperclipIcon = mk('paperclip');
export const SmileIcon = mk('smile');
export const MoreIcon = mk('more-horizontal');
export const ReplyIcon = mk('corner-up-left');
export const ForwardIcon = mk('corner-up-right');
export const TrashIcon = mk('trash-2');
export const EditIcon = mk('edit-2');
export const XIcon = mk('x');
export const UsersIcon = mk('users');
export const PinIcon = mk('bookmark');
export const BarChartIcon = mk('bar-chart-2');

/** Double-check (read receipt) — Feather has no double-check, so overlap two. */
export function CheckCheckIcon({ size = 16, color = 'currentColor' }: IconProps) {
  const c = color === 'currentColor' ? undefined : color;
  return (
    <View style={{ width: size + 4, height: size, flexDirection: 'row' }}>
      <Feather name="check" size={size} color={c} style={{ position: 'absolute', left: 0 }} />
      <Feather name="check" size={size} color={c} style={{ position: 'absolute', left: 4 }} />
    </View>
  );
}
