import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildOnboardTx } from "@umbra/core";
import { SUINS_MINT_URL, umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { pickImage, uploadImage, type PickedImage } from "@/lib/media";
import { Avatar, Button, Field } from "@/components/ui";

export default function Onboarding() {
  const { address } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const run = useGasless();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOk = /^[a-z0-9_]{3,20}$/.test(handle);

  async function submit() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const avatarBlobId = avatar ? await uploadImage(avatar) : null;
      let suinsName: string | null = null;
      try {
        const res = await fetch(SUINS_MINT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, address }),
        });
        if (res.ok) suinsName = (await res.json()).subname ?? null;
      } catch {
        /* subname optional */
      }
      await run(buildOnboardTx(umbraConfig, { handle, displayName: displayName || handle, bio, avatarBlobId, suinsName }));
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 16 }}>
      <Text className="text-2xl font-bold text-ink">Create your profile</Text>

      <Pressable onPress={async () => setAvatar(await pickImage())} className="flex-row items-center gap-4">
        <Avatar name={handle || "u"} uri={avatar?.uri ?? null} size={64} />
        <Text className="font-medium text-accent">Upload avatar</Text>
      </Pressable>

      <View className="gap-1">
        <Text className="font-medium text-ink">Handle</Text>
        <Field value={handle} onChangeText={(t) => setHandle(t.toLowerCase())} placeholder="lagoskid" autoCapitalize="none" maxLength={20} />
        {handle && !handleOk ? (
          <Text className="text-xs text-danger">3–20 chars, a–z 0–9 _ only</Text>
        ) : handle ? (
          <Text className="text-xs text-ink-faint">{handle}.umbra.sui</Text>
        ) : null}
      </View>

      <View className="gap-1">
        <Text className="font-medium text-ink">Display name</Text>
        <Field value={displayName} onChangeText={setDisplayName} maxLength={50} />
      </View>

      <View className="gap-1">
        <Text className="font-medium text-ink">Bio</Text>
        <Field value={bio} onChangeText={setBio} multiline maxLength={280} style={{ minHeight: 70 }} />
      </View>

      {error ? <Text className="text-danger">{error}</Text> : null}
      <Button label={`Claim @${handle || "handle"}`} onPress={submit} disabled={!handleOk} loading={busy} />
    </ScrollView>
  );
}
