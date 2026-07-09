import { useState } from "react";
import { Image, View, type ImageStyle, type StyleProp } from "react-native";

/**
 * Remote image with a graceful placeholder on failure. The `uri` should point
 * at the indexer image proxy (lib/config `imgUrl`), which serves Walrus blobs
 * with a proper image Content-Type and is always reachable from the device.
 */
export function RemoteImage({ uri, style }: { uri?: string | null; style?: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <View style={style} />;
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />;
}
