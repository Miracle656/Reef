import { useState } from "react";
import { FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildCreatePostTx, type Post } from "@umbra/core";
import { palette } from "@umbra/ui";
import { INDEXER_URL, isConfigured, umbraConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useGasless } from "@/lib/gasless";
import { pickImage, uploadImage, type PickedImage } from "@/lib/media";
import { trpc } from "@/lib/trpc";
import { Button, Field, Spinner } from "@/components/ui";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";
import { Welcome } from "@/components/welcome";
import { useUnreadNotifications } from "@/lib/notifications";

export default function Home() {
  const { address, configured, signIn, signOut, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const unreadNotifs = useUnreadNotifications();
  const qc = useQueryClient();
  const run = useGasless();

  const profile = useQuery({
    queryKey: ["profile-by-addr", address],
    queryFn: () => trpc.profileByAddress.query({ address: address! }),
    enabled: Boolean(address),
  });
  const feed = useQuery({
    queryKey: ["feed", address],
    queryFn: () => trpc.feed.query({ address: address! }),
    enabled: Boolean(address && profile.data),
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const [text, setText] = useState("");
  const [image, setImage] = useState<PickedImage | null>(null);
  const post = useMutation({
    mutationFn: async () => {
      const media: string[] = [];
      if (image) media.push(await uploadImage(image));
      await run(buildCreatePostTx(umbraConfig, { text: text.trim(), media }));
    },
    onSuccess: async () => {
      setText("");
      setImage(null);
      await qc.invalidateQueries({ queryKey: ["feed", address] });
    },
  });

  // Signed out: the full-bleed "beach party" welcome (gradient runs under the
  // status bar — no header, no inset).
  if (!address) return <Welcome onGoogle={signIn} loading={loading} configured={configured && isConfigured} />;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <View className="flex-row items-center" style={{ gap: 9 }}>
          <Image source={require("../assets/reef-logo.png")} style={{ width: 30, height: 30, resizeMode: "contain" }} />
          <Text style={{ fontFamily: "Expose-Black", letterSpacing: -0.7 }} className="text-2xl text-ink">ReeF</Text>
        </View>
        <View className="flex-row items-center" style={{ gap: 16 }}>
          <Pressable onPress={() => router.push("/notifications" as never)} hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={palette.light.ink} />
            {unreadNotifs > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  right: -3,
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  backgroundColor: palette.light.accent,
                  borderWidth: 1.5,
                  borderColor: palette.light.background,
                }}
              />
            ) : null}
          </Pressable>
          <Text onPress={signOut} className="text-sm font-medium text-ink-soft">
            Sign out
          </Text>
        </View>
      </View>

      {profile.isLoading ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Spinner />
          <Text className="text-ink-soft">Loading your profile…</Text>
        </View>
      ) : profile.isError ? (
        <View className="flex-1 justify-center gap-3 px-6">
          <Text className="text-xl font-bold text-ink">Can&apos;t reach ReeF servers</Text>
          <Text className="text-ink-soft">
            The app can&apos;t connect to the indexer at {INDEXER_URL}. Make sure it&apos;s running and your phone is on the
            same Wi-Fi as the PC.
          </Text>
          <Text selectable className="text-xs text-ink-faint">signed in as {address}</Text>
          <Button label="Retry" onPress={() => profile.refetch()} loading={profile.isFetching} />
          <Text onPress={signOut} className="text-center text-sm text-ink-soft">Sign out</Text>
        </View>
      ) : !profile.data ? (
        <View className="flex-1 justify-center gap-4 px-6">
          <Text className="text-2xl font-bold text-ink">One step left</Text>
          <Text className="text-ink-soft">Claim your handle to start posting.</Text>
          <Text selectable className="text-xs text-ink-faint">signed in as {address}</Text>
          <Button label="Set up profile" onPress={() => router.push("/onboarding")} />
        </View>
      ) : (
        <FlatList
          data={feed.data ?? []}
          keyExtractor={(p: Post) => p.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={feed.isFetching} onRefresh={() => feed.refetch()} />}
          ListHeaderComponent={
            <View className="border-b border-border px-4 pb-3 pt-2">
              <Field
                value={text}
                onChangeText={setText}
                placeholder="What's happening in Lagos?"
                multiline
                maxLength={560}
                style={{ minHeight: 56, borderRadius: 20, borderWidth: 0, backgroundColor: palette.light.surfaceMuted }}
              />
              {image ? <Image source={{ uri: image.uri }} style={{ height: 120, borderRadius: 14, marginTop: 8 }} /> : null}
              <View className="mt-2.5 flex-row items-center justify-between">
                <Text onPress={async () => setImage(await pickImage())} className="font-semibold text-accent">
                  + Image
                </Text>
                <Button
                  label="Post"
                  variant="accent"
                  onPress={() => post.mutate()}
                  loading={post.isPending}
                  disabled={text.trim().length === 0 && !image}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <Text className="py-12 text-center text-ink-soft">Your feed is quiet. Follow people to fill it up.</Text>
          }
        />
      )}
      <BottomNav />
    </View>
  );
}
