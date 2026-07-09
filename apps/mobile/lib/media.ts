import * as ImagePicker from "expo-image-picker";
import { fromBase64 } from "@mysten/sui/utils";
import { walrus } from "@umbra/core";
import { umbraConfig } from "./config";

export type PickedImage = { uri: string; bytes: Uint8Array };

/** Open the library, return the picked image's uri + raw bytes (or null). */
export async function pickImage(): Promise<PickedImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    base64: true,
    quality: 0.8,
  });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset?.base64) return null;
  return { uri: asset.uri, bytes: fromBase64(asset.base64) };
}

/** Upload picked image bytes to Walrus, returning the blob id. */
export async function uploadImage(img: PickedImage): Promise<string> {
  const { blobId } = await walrus.upload(umbraConfig, img.bytes);
  return blobId;
}
